import { redirect } from "next/navigation";

export default function LegacyMailRedirect() {
  redirect("/wii/mail");
}
