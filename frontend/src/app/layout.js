import "./globals.css";
import { AuthProvider } from "@/lib/auth";

export const metadata = {
  title: "AI Career Companion",
  description: "Your intelligent career development platform",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
