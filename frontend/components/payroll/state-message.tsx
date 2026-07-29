import { AlertCircle, FileUp } from "lucide-react";
import Link from "next/link";

export function StateMessage({ title, detail, uploadLink = false }: { title: string; detail?: string; uploadLink?: boolean }) {
  return (
    <div className="stateMessage">
      {uploadLink ? <FileUp size={22} /> : <AlertCircle size={22} />}
      <div>
        <strong>{title}</strong>
        {detail ? <p>{detail}</p> : null}
        {uploadLink ? <Link href="/upload">Upload attendance</Link> : null}
      </div>
    </div>
  );
}

