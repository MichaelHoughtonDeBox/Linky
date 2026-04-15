import { ImageResponse } from "next/og";

export const size = {
  width: 180,
  height: 180,
};

export const contentType = "image/png";

export default function AppleIcon() {
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
        {/* Keep the apple-touch icon aligned with the slash logo mark. */}
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
