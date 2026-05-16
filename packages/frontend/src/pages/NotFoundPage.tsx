import { NotFound404 } from "./NotFound404";

export function NotFoundPage() {
  return (
    <NotFound404
      subtitle="The page you requested does not exist in this workspace. Check the URL, or head back to where you started."
      primaryLabel="Go home"
      primaryHref="/"
      secondary={{ label: "report a broken link", href: "mailto:cubity@cubityfir.st?subject=Annex%20Broken%20Link" }}
    />
  );
}
