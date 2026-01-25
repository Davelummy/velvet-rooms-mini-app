import "./globals.css";
import TelegramShim from "./TelegramShim";

export const metadata = {
  title: "Velvet Rooms",
  description: "Velvet Rooms mini-app",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <TelegramShim />
        {children}
      </body>
    </html>
  );
}
