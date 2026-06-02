package middleware

import (
	"net/http"
	"regexp"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/go-playground/validator/v10"
)

var validate = validator.New()

func init() {
	// Register custom validators
	validate.RegisterValidation("password", validatePassword)
	validate.RegisterValidation("username", validateUsername)
}

// ValidationError represents a validation error
type ValidationError struct {
	Field   string `json:"field"`
	Message string `json:"message"`
}

// ValidationMiddleware validates request body
func ValidationMiddleware(obj interface{}) gin.HandlerFunc {
	return func(c *gin.Context) {
		if err := c.ShouldBindJSON(obj); err != nil {
			var errors []ValidationError
			
			if validationErrors, ok := err.(validator.ValidationErrors); ok {
				for _, e := range validationErrors {
					errors = append(errors, ValidationError{
						Field:   e.Field(),
						Message: getErrorMsg(e),
					})
				}
			} else {
				errors = append(errors, ValidationError{
					Field:   "request",
					Message: "Invalid request body",
				})
			}
			
			c.JSON(http.StatusBadRequest, gin.H{
				"error":   "Validation failed",
				"details": errors,
			})
			c.Abort()
			return
		}
		
		c.Next()
	}
}

// getErrorMsg returns a human-readable error message
func getErrorMsg(e validator.FieldError) string {
	switch e.Tag() {
	case "required":
		return "This field is required"
	case "email":
		return "Invalid email format"
	case "min":
		return "Too short (minimum " + e.Param() + " characters)"
	case "max":
		return "Too long (maximum " + e.Param() + " characters)"
	case "password":
		return "Password must be at least 8 characters with uppercase, lowercase, and number"
	case "username":
		return "Username must be 3-30 characters, alphanumeric and underscores only"
	default:
		return "Invalid value"
	}
}

// validatePassword validates password strength
func validatePassword(fl validator.FieldLevel) bool {
	password := fl.Field().String()
	if len(password) < 8 {
		return false
	}
	
	// Check for at least one uppercase, one lowercase, and one number
	var hasUpper, hasLower, hasNumber bool
	for _, char := range password {
		switch {
		case char >= 'A' && char <= 'Z':
			hasUpper = true
		case char >= 'a' && char <= 'z':
			hasLower = true
		case char >= '0' && char <= '9':
			hasNumber = true
		}
	}
	
	return hasUpper && hasLower && hasNumber
}

// validateUsername validates username format
func validateUsername(fl validator.FieldLevel) bool {
	username := fl.Field().String()
	if len(username) < 3 || len(username) > 30 {
		return false
	}
	
	// Only alphanumeric and underscores
	match, _ := regexp.MatchString("^[a-zA-Z0-9_]+$", username)
	return match
}

// SanitizeString removes potentially dangerous characters
func SanitizeString(input string) string {
	// Remove null bytes
	input = strings.ReplaceAll(input, "\x00", "")
	
	// Trim whitespace
	input = strings.TrimSpace(input)
	
	// Limit length
	if len(input) > 1000 {
		input = input[:1000]
	}
	
	return input
}

// XSSProtectionMiddleware adds XSS protection headers
func XSSProtectionMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Writer.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'")
		c.Next()
	}
}

// InputSanitizationMiddleware sanitizes input parameters
func InputSanitizationMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Sanitize query parameters
		for key, values := range c.Request.URL.Query() {
			for i, value := range values {
				values[i] = SanitizeString(value)
			}
			c.Request.URL.Query()[key] = values
		}
		
		c.Next()
	}
}
