import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./config", () => ({
  apiBaseUrl: "https://preview.example.com"
}));

import { App } from "./App";

describe("App", () => {
  it("renders app heading and API base URL", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Oil Shock MVP" })).toBeInTheDocument();
    expect(screen.getByText(/https:\/\/preview\.example\.com/)).toBeInTheDocument();
  });
});
