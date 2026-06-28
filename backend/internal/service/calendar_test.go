package service

import (
	"testing"

	"github.com/thienduchuutran/church-website/backend/internal/model"
)

func strptr(s string) *string { return &s }

func TestBuildSeedLine(t *testing.T) {
	tests := []struct {
		name string
		e    *model.CalendarEvent
		want string
	}{
		{
			name: "single day",
			e:    &model.CalendarEvent{Date: "2026-05-22", Title: "Game Night"},
			want: "• May 22: Game Night",
		},
		{
			name: "end equal to start is single day",
			e:    &model.CalendarEvent{Date: "2026-05-22", EndDate: strptr("2026-05-22"), Title: "Workday"},
			want: "• May 22: Workday",
		},
		{
			name: "same-month span",
			e:    &model.CalendarEvent{Date: "2026-05-22", EndDate: strptr("2026-05-25"), Title: "Youth Camp"},
			want: "• May 22-25: Youth Camp",
		},
		{
			name: "cross-month span",
			e:    &model.CalendarEvent{Date: "2026-05-30", EndDate: strptr("2026-06-02"), Title: "Conference"},
			want: "• May 30 - Jun 2: Conference",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := buildSeedLine(tt.e); got != tt.want {
				t.Fatalf("buildSeedLine() = %q, want %q", got, tt.want)
			}
		})
	}
}
