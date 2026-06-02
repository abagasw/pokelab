package api

// Tipe-tipe umum untuk API Pokemon TCG Indonesia

// Response merupakan struktur response standar
type Response struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data,omitempty"`
	Error   string      `json:"error,omitempty"`
	Meta    *Meta       `json:"meta,omitempty"`
}

// Meta metadata untuk response dengan pagination
type Meta struct {
	Page       int   `json:"page"`
	Limit      int   `json:"limit"`
	Total      int64 `json:"total"`
	TotalPages int   `json:"total_pages"`
}

// ErrorResponse response error
type ErrorResponse struct {
	Success bool   `json:"success"`
	Error   string `json:"error"`
	Code    int    `json:"code"`
}

// HealthResponse response health check
type HealthResponse struct {
	Status  string `json:"status"`
	Service string `json:"service"`
	Version string `json:"version"`
}

// PriceInfo informasi harga
type PriceInfo struct {
	IDR       float64 `json:"idr,omitempty"`
	USD       float64 `json:"usd,omitempty"`
	Exchange  float64 `json:"exchange_rate"`
	Source    string  `json:"source"`
	UpdatedAt string  `json:"updated_at"`
}

// TypeChartInfo informasi type chart
type TypeChartInfo struct {
	Type        string   `json:"type"`
	WeakTo      []string `json:"weak_to"`
	ResistantTo []string `json:"resistant_to"`
	ImmuneTo    []string `json:"immune_to,omitempty"`
}
