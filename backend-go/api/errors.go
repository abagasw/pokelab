package api

import "errors"

// Error definitions untuk API
var (
	// General errors
	ErrNotFound     = errors.New("resource not found")
	ErrInvalidInput = errors.New("invalid input")
	ErrUnauthorized = errors.New("unauthorized")
	ErrForbidden    = errors.New("forbidden")
	ErrInternal     = errors.New("internal server error")

	// Card errors
	ErrCardNotFound = errors.New("card not found")
	ErrInvalidCardID = errors.New("invalid card ID")

	// Deck errors
	ErrDeckNotFound = errors.New("deck not found")
	ErrInvalidDeck = errors.New("invalid deck configuration")

	// Collection errors
	ErrCollectionNotFound = errors.New("collection not found")
	ErrItemNotFound       = errors.New("item not found")
)

// ErrorCode HTTP status codes untuk error
type ErrorCode int

const (
	CodeOK                  ErrorCode = 200
	CodeCreated             ErrorCode = 201
	CodeBadRequest          ErrorCode = 400
	CodeUnauthorized        ErrorCode = 401
	CodeForbidden           ErrorCode = 403
	CodeNotFound            ErrorCode = 404
	CodeInternalServerError ErrorCode = 500
)

// ErrorInfo informasi error untuk response
type ErrorInfo struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Detail  string `json:"detail,omitempty"`
}

// ErrorMap mapping error ke ErrorInfo
var ErrorMap = map[error]ErrorInfo{
	ErrNotFound:     {Code: 404, Message: "Resource not found"},
	ErrInvalidInput: {Code: 400, Message: "Invalid input"},
	ErrUnauthorized: {Code: 401, Message: "Unauthorized"},
	ErrForbidden:    {Code: 403, Message: "Forbidden"},
	ErrInternal:     {Code: 500, Message: "Internal server error"},
}

// GetErrorInfo mendapatkan ErrorInfo dari error
func GetErrorInfo(err error) ErrorInfo {
	if info, ok := ErrorMap[err]; ok {
		return info
	}
	return ErrorInfo{Code: 500, Message: "Unknown error", Detail: err.Error()}
}
