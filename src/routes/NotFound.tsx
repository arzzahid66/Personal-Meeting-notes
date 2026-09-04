import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function NotFoundScreen() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-5xl font-semibold tracking-tight text-muted-foreground/40">
        404
      </p>
      <div className="space-y-1">
        <h1 className="text-lg font-medium">Page not found</h1>
        <p className="text-sm text-muted-foreground">
          That page does not exist.
        </p>
      </div>
      <Button asChild>
        <Link to="/meetings">Go to meetings</Link>
      </Button>
    </div>
  );
}
