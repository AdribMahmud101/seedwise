import "./style.css";
import "./recovery.css";

export const metadata = {
  title: "Ropon Radar · Rangpur Field Lab",
  description:
    "Explore crop rotations, field layouts and real NASA environmental observations for Rangpur. A farmer and research demonstration by Ropon Radar.",
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
