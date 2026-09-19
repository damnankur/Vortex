import "./globals.css";
import type { Metadata } from "next";
import { SocketProvider } from "../context/SocketProvider";
import { VoiceProvider } from "../context/VoiceProvider";

export const metadata: Metadata = {
  title: "Vortex - Real-time Chat",
  description: "Scalable real-time chat application powered by Redis PubSub and Kafka",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element {
  return (
    <html lang="en">
      <body>
        <SocketProvider>
          <VoiceProvider>{children}</VoiceProvider>
        </SocketProvider>
      </body>
    </html>
  );
}
