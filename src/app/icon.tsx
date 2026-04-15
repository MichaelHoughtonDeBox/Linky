import { ImageResponse } from "next/og";

export const size = {
  width: 64,
  height: 64,
};

export const contentType = "image/png";

export default function Icon() {
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
        {/* Core logo mark: black forward slash centered on white field. */}
        <div
          style={{
            width: "16%",
            height: "76%",
            background: "#000000",
            transform: "rotate(26deg)",
          }}
        />
      </div>
    ),
    size,
  );
}
