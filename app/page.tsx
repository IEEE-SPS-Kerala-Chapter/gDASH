import { redirect } from "next/navigation";

// There's no separate landing page — the site's front door is registration.
// (This used to be a leftover developer placeholder that participants could
// reach from the registration form's Back arrow and logo.)
export default function Home() {
  redirect("/register");
}
