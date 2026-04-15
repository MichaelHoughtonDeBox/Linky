import { ImageResponse } from "next/og";

export const alt = "Linky logo: black forward slash on white background.";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default function TwitterImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#ffffff",
        }}
      >
        {/* Reuse the slash mark so all social previews match. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 40,
            color: "#000000",
            fontSize: 128,
            letterSpacing: -2,
            fontWeight: 600,
          }}
        >
          <div
            style={{
              width: 32,
              height: 160,
              background: "#000000",
              transform: "rotate(26deg)",
            }}
          />
          <span>Linky</span>
        </div>
      </div>
    ),
    size,
  );
}
