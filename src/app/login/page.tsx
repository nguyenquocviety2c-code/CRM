"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/stores/auth-store";

export default function LoginPage() {
  const router = useRouter();
  const { login, user, loading } = useAuthStore();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // If a logged-in user lands on /login (e.g. navigates back), skip the form
  // and go straight to the admin dashboard.
  useEffect(() => {
    if (!loading && user) {
      router.replace("/cashier");
    }
  }, [loading, user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!identifier.trim() || !password) {
      setError("Vui lòng nhập tên đăng nhập/email và mật khẩu");
      return;
    }
    setSubmitting(true);
    const res = await login(identifier.trim(), password);
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error || "Đăng nhập thất bại");
      return;
    }
    router.push("/cashier");
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gray-50">
      {/* Back to /dat-lich button — top-left corner */}
      <button
        type="button"
        onClick={() => router.push("/dat-lich")}
        className="absolute left-4 top-4 flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
      >
        <ArrowLeft className="h-4 w-4" />
        Về trang đặt lịch
      </button>
      <div className="w-full max-w-md space-y-6 rounded-lg border bg-white p-8 shadow-sm">
        <div className="text-center">
          {/* Design A — high-res brand composition (logo emblem + "Level 1
              Haircare" text below, in the logo's own style). Pure white
              background wrapper guarantees the logo area is white. Enlarged
              (h-72) so the logo + its text are prominent. */}
          <div className="mx-auto flex items-center justify-center bg-white">
            <img
              src="/level1-haircare-logo-full.png"
              alt="Level 1 Haircare"
              className="mx-auto h-72 w-auto object-contain"
            />
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Tên đăng nhập hoặc Email
            </label>
            <Input
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="Nhập tên đăng nhập hoặc email"
              className="mt-1"
              autoComplete="username"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Mật khẩu
            </label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="mt-1"
              autoComplete="current-password"
            />
          </div>
          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Đang đăng nhập..." : "Đăng nhập"}
          </Button>
        </form>
      </div>
    </div>
  );
}
