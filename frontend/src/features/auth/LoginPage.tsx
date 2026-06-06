import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { ApiError, login } from "../../lib/api";
import { useAuthStore } from "../../store/auth";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { AuthLayout } from "./AuthLayout";

export function LoginPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  const mutation = useMutation({
    mutationFn: () => login({ email: email.trim(), password }),
    onSuccess: (data) => {
      setAuth(data.access_token, data.user);
      navigate("/", { replace: true });
    },
  });

  const validate = (): boolean => {
    const next: { email?: string; password?: string } = {};
    if (!email.trim()) next.email = "Email is required.";
    if (!password) next.password = "Password is required.";
    else if (password.length < 6) next.password = "Password must be at least 6 characters.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (validate()) mutation.mutate();
  };

  const formError = mutation.isError
    ? mutation.error instanceof ApiError
      ? mutation.error.detail
      : "Something went wrong. Please try again."
    : null;

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to dispatch your twin into the island."
      footer={
        <>
          New to Another Me?{" "}
          <Link to="/register" className="font-medium text-brand transition-colors hover:text-brand-strong">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
        />
        <Input
          label="Password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
        />

        {formError && (
          <div className="rounded-xl border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
            {formError}
          </div>
        )}

        <Button type="submit" size="lg" loading={mutation.isPending} className="mt-1 w-full">
          Sign in
        </Button>
      </form>
    </AuthLayout>
  );
}
