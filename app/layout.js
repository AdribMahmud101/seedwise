import "./style.css";
import "./journey.css";
import "./recovery.css";
import "./labels.css";
import "./lowground.css";
import "./landscape.css";
import "./studio.css";
import "./rotation-tool.css";
import "./planner3d.css";
import "./plangen.css";
import "./weather.css";

export const metadata = {
  title: "SeedWise · Rangpur Field Lab",
  description:
    "Explore crop rotations, field layouts and real NASA environmental observations for Rangpur. A farmer and research demonstration by SeedWise.",
  icons: { icon: "/assets/mark.svg" },
};

export const viewport = { themeColor: "#233d2b" };

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="stylesheet" href="/assets/leaflet.css" />
      </head>
      <body suppressHydrationWarning>
        {children}
        <div id="toast" role="status" aria-live="polite"></div>
        <dialog id="modal"></dialog>
      </body>
    </html>
  );
}
