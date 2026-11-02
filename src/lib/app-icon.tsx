import { ImageResponse } from "next/og";
import { APP } from "./app-config";

/** The app's logo (initials on its brand colour) as a PNG, for favicons and home-screen icons. */
export function renderAppIcon(size: number, radius: number): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: APP.accent,
          borderRadius: radius,
          color: "#fff",
          fontSize: size * 0.46,
          fontWeight: 700,
          letterSpacing: -size * 0.02,
        }}
      >
        {APP.initials}
      </div>
    ),
    { width: size, height: size }
  );
}
