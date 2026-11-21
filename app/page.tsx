import { Suspense } from "react";
import LoginWrapper from "@/src/xpages/Login/wrapper";
import Link from "next/link";

export default function Login() {
  return (
    <Suspense fallback={null}>
      <Link href="/competitions" style={{ position: "fixed", right: 24, top: 16, zIndex: 10, color: "#194d41" }}>实验室参赛调研台 →</Link>
      <LoginWrapper />
    </Suspense>
  );
}
