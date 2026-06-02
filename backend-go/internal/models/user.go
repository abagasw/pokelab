package models

import (
	"time"
)

// User represents a user in the system
type User struct {
	ID                string     `json:"id" db:"id"`
	Email             string     `json:"email" db:"email"`
	Username          string     `json:"username" db:"username"`
	FullName          string     `json:"full_name" db:"full_name"`
	AvatarURL         string     `json:"avatar_url,omitempty" db:"avatar_url"`
	EmailVerified     bool       `json:"email_verified" db:"email_verified"`
	VerificationToken *string    `json:"-" db:"verification_token"`
	LastLogin         *time.Time `json:"last_login,omitempty" db:"last_login"`
	CreatedAt         time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt         time.Time  `json:"updated_at" db:"updated_at"`
}

// PublicUser represents public user information (safe to expose)
type PublicUser struct {
	ID        string `json:"id"`
	Username  string `json:"username"`
	AvatarURL string `json:"avatar_url,omitempty"`
}
