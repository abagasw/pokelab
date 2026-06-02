package services

import (
	"database/sql"
	"testing"

	"pokemon-tcg-indonesia/internal/auth"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	_ "modernc.org/sqlite"
)

func setupAuthTestDB(t *testing.T) *sql.DB {
	db, err := sql.Open("sqlite", ":memory:")
	require.NoError(t, err)

	schema := `
	CREATE TABLE IF NOT EXISTS users (
		id TEXT PRIMARY KEY,
		email TEXT UNIQUE NOT NULL,
		username TEXT UNIQUE NOT NULL,
		password_hash TEXT NOT NULL,
		full_name TEXT,
		avatar_url TEXT,
		email_verified BOOLEAN DEFAULT 0,
		verification_token TEXT,
		reset_token TEXT,
		reset_token_expires TIMESTAMP,
		last_login TIMESTAMP,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS refresh_tokens (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL,
		token_hash TEXT UNIQUE NOT NULL,
		device_info TEXT,
		ip_address TEXT,
		expires_at TIMESTAMP NOT NULL,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS collections (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL,
		name TEXT DEFAULT 'My Collection',
		is_default BOOLEAN DEFAULT 0,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);
	`
	_, err = db.Exec(schema)
	require.NoError(t, err)

	return db
}

func TestAuthService_Register(t *testing.T) {
	db := setupAuthTestDB(t)
	defer db.Close()

	jwtService := auth.NewJWTService("test-secret")
	service := NewAuthService(db, jwtService)

	t.Run("Register new user", func(t *testing.T) {
		req := RegisterRequest{
			Email:    "test@example.com",
			Username: "testuser",
			Password: "password123",
			FullName: "Test User",
		}

		resp, err := service.Register(req)
		require.NoError(t, err)
		assert.NotNil(t, resp.User)
		assert.Equal(t, "test@example.com", resp.User.Email)
		assert.Equal(t, "testuser", resp.User.Username)
		assert.NotEmpty(t, resp.AccessToken)
		assert.NotEmpty(t, resp.RefreshToken)
	})

	t.Run("Register duplicate email", func(t *testing.T) {
		req := RegisterRequest{
			Email:    "test@example.com",
			Username: "testuser2",
			Password: "password123",
		}

		_, err := service.Register(req)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "already exists")
	})

	t.Run("Register duplicate username", func(t *testing.T) {
		req := RegisterRequest{
			Email:    "test2@example.com",
			Username: "testuser",
			Password: "password123",
		}

		_, err := service.Register(req)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "already exists")
	})
}

func TestAuthService_Login(t *testing.T) {
	db := setupAuthTestDB(t)
	defer db.Close()

	jwtService := auth.NewJWTService("test-secret")
	service := NewAuthService(db, jwtService)

	// Register a user first
	_, err := service.Register(RegisterRequest{
		Email:    "login@test.com",
		Username: "loginuser",
		Password: "password123",
		FullName: "Login User",
	})
	require.NoError(t, err)

	t.Run("Login with correct credentials", func(t *testing.T) {
		req := LoginRequest{
			Email:    "login@test.com",
			Password: "password123",
		}

		resp, err := service.Login(req, "", "")
		require.NoError(t, err)
		assert.NotNil(t, resp.User)
		assert.NotEmpty(t, resp.AccessToken)
		assert.NotEmpty(t, resp.RefreshToken)
	})

	t.Run("Login with wrong password", func(t *testing.T) {
		req := LoginRequest{
			Email:    "login@test.com",
			Password: "wrongpassword",
		}

		_, err := service.Login(req, "", "")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "invalid")
	})

	t.Run("Login with non-existent email", func(t *testing.T) {
		req := LoginRequest{
			Email:    "nonexistent@test.com",
			Password: "password123",
		}

		_, err := service.Login(req, "", "")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "invalid")
	})
}

func TestAuthService_PasswordReset(t *testing.T) {
	db := setupAuthTestDB(t)
	defer db.Close()

	jwtService := auth.NewJWTService("test-secret")
	service := NewAuthService(db, jwtService)

	// Register a user
	_, err := service.Register(RegisterRequest{
		Email:    "reset@test.com",
		Username: "resetuser",
		Password: "password123",
	})
	require.NoError(t, err)

	t.Run("Forgot password - existing email", func(t *testing.T) {
		req := ForgotPasswordRequest{Email: "reset@test.com"}
		token, err := service.ForgotPassword(req)
		require.NoError(t, err)
		assert.NotEmpty(t, token)
	})

	t.Run("Forgot password - non-existent email", func(t *testing.T) {
		req := ForgotPasswordRequest{Email: "nonexistent@test.com"}
		token, err := service.ForgotPassword(req)
		require.NoError(t, err)
		assert.Empty(t, token) // Should not reveal if email exists
	})
}
