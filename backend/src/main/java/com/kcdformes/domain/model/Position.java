package com.kcdformes.domain.model;

public record Position(int x, int y) {

    public double distanceTo(Position other) {
        int dx = this.x - other.x;
        int dy = this.y - other.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    public boolean isAdjacentTo(Position other) {
        return Math.abs(this.x - other.x) <= 1 && Math.abs(this.y - other.y) <= 1;
    }

    @Override
    public String toString() {
        return "(%d, %d)".formatted(x, y);
    }
}
