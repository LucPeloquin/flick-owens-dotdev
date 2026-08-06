import { OSShell } from "@/components/os/OSShell";
import "../../wii.css";

export default function WiiLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <OSShell>{children}</OSShell>;
}
