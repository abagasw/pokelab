package services

import (
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
	"pokemon-tcg-indonesia/internal/auth"
	"pokemon-tcg-indonesia/internal/models"
	"strings"
	"time"

	"github.com/google/uuid"
)

// AuthService handles authentication
type AuthService struct {
	db         *sql.DB
	jwtService *auth.JWTService
}

// NewAuthService creates a new AuthService
func NewAuthService(db *sql.DB, jwtService *auth.JWTService) *AuthService {
	return &AuthService{
		db:         db,
		jwtService: jwtService,
	}
}

// RegisterRequest represents registration request
type RegisterRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Username string `json:"username" binding:"required,min=3,max=30"`
	Password string `json:"password" binding:"required,min=8"`
	FullName string `json:"full_name"`
}

// LoginRequest represents login request
type LoginRequest struct {
	Email    string `json:"email" binding:"required"`
	Password string `json:"password" binding:"required"`
}

// AuthResponse represents authentication response
type AuthResponse struct {
	User         *models.User `json:"user"`
	AccessToken  string       `json:"access_token"`
	RefreshToken string       `json:"refresh_token"`
	ExpiresIn    int64        `json:"expires_in"`
}

// ForgotPasswordRequest represents forgot password request
type ForgotPasswordRequest struct {
	Email string `json:"email" binding:"required,email"`
}

// ResetPasswordRequest represents reset password request
type ResetPasswordRequest struct {
	Token       string `json:"token" binding:"required"`
	NewPassword string `json:"new_password" binding:"required,min=8"`
}

// Register creates a new user
func (s *AuthService) Register(req RegisterRequest) (*AuthResponse, error) {
	// Check if email exists
	var exists bool
	err := s.db.QueryRow("SELECT EXISTS(SELECT 1 FROM users WHERE email = ? OR username = ?)", 
		req.Email, req.Username).Scan(&exists)
	if err != nil {
		return nil, fmt.Errorf("database error: %w", err)
	}
	if exists {
		return nil, fmt.Errorf("email or username already exists")
	}

	// Hash password
	passwordHash, err := auth.HashPassword(req.Password)
	if err != nil {
		return nil, fmt.Errorf("failed to hash password: %w", err)
	}

	// Generate verification token
	verificationToken, err := generateRandomToken()
	if err != nil {
		return nil, fmt.Errorf("failed to generate token: %w", err)
	}

	// Create user
	userID := uuid.New().String()
	now := time.Now()

	_, err = s.db.Exec(`
		INSERT INTO users (id, email, username, password_hash, full_name, verification_token, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`, userID, strings.ToLower(req.Email), req.Username, passwordHash, req.FullName, 
		verificationToken, now, now)
	if err != nil {
		return nil, fmt.Errorf("failed to create user: %w", err)
	}

	// Create default collection for user
	collectionID := uuid.New().String()
	_, err = s.db.Exec(`
		INSERT INTO collections (id, user_id, name, is_default, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?)
	`, collectionID, userID, "My Collection", true, now, now)
	if err != nil {
		// Log error but don't fail registration
		fmt.Printf("Failed to create default collection: %v\n", err)
	}

	// Generate tokens
	accessToken, err := s.jwtService.GenerateAccessToken(userID, req.Email, req.Username)
	if err != nil {
		return nil, fmt.Errorf("failed to generate access token: %w", err)
	}

	refreshToken, err := s.generateAndStoreRefreshToken(userID, "", "")
	if err != nil {
		return nil, fmt.Errorf("failed to generate refresh token: %w", err)
	}

	user := &models.User{
		ID:                userID,
		Email:             req.Email,
		Username:          req.Username,
		FullName:          req.FullName,
		EmailVerified:     false,
		VerificationToken: &verificationToken,
		CreatedAt:         now,
		UpdatedAt:         now,
	}

	return &AuthResponse{
		User:         user,
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		ExpiresIn:    int64(s.jwtService.GetAccessTokenTTL().Seconds()),
	}, nil
}

// Login authenticates a user
func (s *AuthService) Login(req LoginRequest, deviceInfo, ipAddress string) (*AuthResponse, error) {
	// Find user by email
	var user models.User
	var passwordHash string
	var avatarURL *string
	err := s.db.QueryRow(`
		SELECT id, email, username, password_hash, full_name, avatar_url, email_verified, created_at, updated_at
		FROM users WHERE email = ?
	`, strings.ToLower(req.Email)).Scan(
		&user.ID, &user.Email, &user.Username, &passwordHash, &user.FullName,
		&avatarURL, &user.EmailVerified, &user.CreatedAt, &user.UpdatedAt,
	)
	if avatarURL != nil {
		user.AvatarURL = *avatarURL
	}
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("invalid email or password")
	}
	if err != nil {
		return nil, fmt.Errorf("database error: %w", err)
	}

	// Verify password
	if !auth.CheckPassword(req.Password, passwordHash) {
		return nil, fmt.Errorf("invalid email or password")
	}

	// Update last login
	_, _ = s.db.Exec("UPDATE users SET last_login = ? WHERE id = ?", time.Now(), user.ID)

	// Generate tokens
	accessToken, err := s.jwtService.GenerateAccessToken(user.ID, user.Email, user.Username)
	if err != nil {
		return nil, fmt.Errorf("failed to generate access token: %w", err)
	}

	refreshToken, err := s.generateAndStoreRefreshToken(user.ID, deviceInfo, ipAddress)
	if err != nil {
		return nil, fmt.Errorf("failed to generate refresh token: %w", err)
	}

	return &AuthResponse{
		User:         &user,
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		ExpiresIn:    int64(s.jwtService.GetAccessTokenTTL().Seconds()),
	}, nil
}

// RefreshToken generates new access token from refresh token
func (s *AuthService) RefreshToken(refreshToken string, deviceInfo, ipAddress string) (*AuthResponse, error) {
	// Hash the token for lookup
	tokenHash := hashToken(refreshToken)

	// Find refresh token in DB
	var tokenID, userID string
	var expiresAt time.Time
	err := s.db.QueryRow(`
		SELECT id, user_id, expires_at FROM refresh_tokens WHERE token_hash = ?
	`, tokenHash).Scan(&tokenID, &userID, &expiresAt)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("invalid refresh token")
	}
	if err != nil {
		return nil, fmt.Errorf("database error: %w", err)
	}

	// Check if expired
	if time.Now().After(expiresAt) {
		// Delete expired token
		_, _ = s.db.Exec("DELETE FROM refresh_tokens WHERE id = ?", tokenID)
		return nil, fmt.Errorf("refresh token expired")
	}

	// Get user
	var user models.User
	var avatarURL2 *string
	err = s.db.QueryRow(`
		SELECT id, email, username, full_name, avatar_url, email_verified, created_at, updated_at
		FROM users WHERE id = ?
	`, userID).Scan(
		&user.ID, &user.Email, &user.Username, &user.FullName,
		&avatarURL2, &user.EmailVerified, &user.CreatedAt, &user.UpdatedAt,
	)
	if avatarURL2 != nil {
		user.AvatarURL = *avatarURL2
	}
	if err != nil {
		return nil, fmt.Errorf("user not found: %w", err)
	}

	// Delete old refresh token (token rotation)
	_, _ = s.db.Exec("DELETE FROM refresh_tokens WHERE id = ?", tokenID)

	// Generate new tokens
	accessToken, err := s.jwtService.GenerateAccessToken(user.ID, user.Email, user.Username)
	if err != nil {
		return nil, fmt.Errorf("failed to generate access token: %w", err)
	}

	newRefreshToken, err := s.generateAndStoreRefreshToken(user.ID, deviceInfo, ipAddress)
	if err != nil {
		return nil, fmt.Errorf("failed to generate refresh token: %w", err)
	}

	return &AuthResponse{
		User:         &user,
		AccessToken:  accessToken,
		RefreshToken: newRefreshToken,
		ExpiresIn:    int64(s.jwtService.GetAccessTokenTTL().Seconds()),
	}, nil
}

// Logout invalidates refresh token
func (s *AuthService) Logout(refreshToken string) error {
	tokenHash := hashToken(refreshToken)
	_, err := s.db.Exec("DELETE FROM refresh_tokens WHERE token_hash = ?", tokenHash)
	return err
}

// LogoutAll invalidates all refresh tokens for user
func (s *AuthService) LogoutAll(userID string) error {
	_, err := s.db.Exec("DELETE FROM refresh_tokens WHERE user_id = ?", userID)
	return err
}

// ForgotPassword generates reset token
func (s *AuthService) ForgotPassword(req ForgotPasswordRequest) (string, error) {
	// Find user
	var userID string
	err := s.db.QueryRow("SELECT id FROM users WHERE email = ?", strings.ToLower(req.Email)).Scan(&userID)
	if err == sql.ErrNoRows {
		// Don't reveal if email exists
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("database error: %w", err)
	}

	// Generate reset token
	resetToken, err := generateRandomToken()
	if err != nil {
		return "", err
	}

	// Store reset token
	expiresAt := time.Now().Add(1 * time.Hour)
	_, err = s.db.Exec(`
		UPDATE users SET reset_token = ?, reset_token_expires = ?, updated_at = ?
		WHERE id = ?
	`, resetToken, expiresAt, time.Now(), userID)
	if err != nil {
		return "", fmt.Errorf("failed to store reset token: %w", err)
	}

	// In production, send email here
	// For now, just return the token
	return resetToken, nil
}

// ResetPassword resets password with token
func (s *AuthService) ResetPassword(req ResetPasswordRequest) error {
	// Find user by reset token
	var userID string
	var expiresAt time.Time
	err := s.db.QueryRow(`
		SELECT id, reset_token_expires FROM users WHERE reset_token = ?
	`, req.Token).Scan(&userID, &expiresAt)
	if err == sql.ErrNoRows {
		return fmt.Errorf("invalid or expired reset token")
	}
	if err != nil {
		return fmt.Errorf("database error: %w", err)
	}

	// Check if expired
	if time.Now().After(expiresAt) {
		return fmt.Errorf("reset token expired")
	}

	// Hash new password
	passwordHash, err := auth.HashPassword(req.NewPassword)
	if err != nil {
		return fmt.Errorf("failed to hash password: %w", err)
	}

	// Update password and clear reset token
	_, err = s.db.Exec(`
		UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL, updated_at = ?
		WHERE id = ?
	`, passwordHash, time.Now(), userID)
	if err != nil {
		return fmt.Errorf("failed to update password: %w", err)
	}

	// Invalidate all refresh tokens for security
	_, _ = s.db.Exec("DELETE FROM refresh_tokens WHERE user_id = ?", userID)

	return nil
}

// GetUserByID gets user by ID
func (s *AuthService) GetUserByID(userID string) (*models.User, error) {
	var user models.User
	var avatarURL *string
	var lastLogin *time.Time
	err := s.db.QueryRow(`
		SELECT id, email, username, full_name, avatar_url, email_verified, last_login, created_at, updated_at
		FROM users WHERE id = ?
	`, userID).Scan(
		&user.ID, &user.Email, &user.Username, &user.FullName,
		&avatarURL, &user.EmailVerified, &lastLogin,
		&user.CreatedAt, &user.UpdatedAt,
	)
	if avatarURL != nil {
		user.AvatarURL = *avatarURL
	}
	if lastLogin != nil {
		user.LastLogin = lastLogin
	}
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("user not found")
	}
	if err != nil {
		return nil, err
	}
	return &user, nil
}

// UpdateProfile updates user profile
func (s *AuthService) UpdateProfile(userID string, updates map[string]interface{}) error {
	// Build update query
	allowedFields := map[string]bool{
		"full_name": true,
		"avatar_url": true,
	}

	setParts := []string{}
	args := []interface{}{}

	for field, value := range updates {
		if allowedFields[field] {
			setParts = append(setParts, fmt.Sprintf("%s = ?", field))
			args = append(args, value)
		}
	}

	if len(setParts) == 0 {
		return fmt.Errorf("no valid fields to update")
	}

	setParts = append(setParts, "updated_at = ?")
	args = append(args, time.Now())
	args = append(args, userID)

	query := fmt.Sprintf("UPDATE users SET %s WHERE id = ?", strings.Join(setParts, ", "))
	_, err := s.db.Exec(query, args...)
	return err
}

// Helper functions

func (s *AuthService) generateAndStoreRefreshToken(userID string, deviceInfo, ipAddress string) (string, error) {
	// Generate token
	token, err := s.jwtService.GenerateRefreshToken()
	if err != nil {
		return "", err
	}

	// Hash token for storage
	tokenHash := hashToken(token)

	// Store in DB
	tokenID := uuid.New().String()
	expiresAt := time.Now().Add(s.jwtService.GetRefreshTokenTTL())

	_, err = s.db.Exec(`
		INSERT INTO refresh_tokens (id, user_id, token_hash, device_info, ip_address, expires_at)
		VALUES (?, ?, ?, ?, ?, ?)
	`, tokenID, userID, tokenHash, deviceInfo, ipAddress, expiresAt)
	if err != nil {
		return "", err
	}

	return token, nil
}

func generateRandomToken() (string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}

func hashToken(token string) string {
	h := sha256.New()
	h.Write([]byte(token))
	return fmt.Sprintf("%x", h.Sum(nil))
}
