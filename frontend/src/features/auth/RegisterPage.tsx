import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ApiError, register } from "../../lib/api";
import { useAuthStore } from "../../store/auth";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { AuthLayout } from "./AuthLayout";

interface FieldErrors {
  email?: string;
  username?: string;
  password?: string;
}

export function RegisterPage() {
  const navigate = useNavigate();
  const { t } = useTranslation("common");
  const setAuth = useAuthStore((s) => s.setAuth);

  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});

  const mutation = useMutation({
    mutationFn: () =>
      register({ email: email.trim(), username: username.trim(), password }),
    onSuccess: (data) => {
      setAuth(data.access_token, data.user);
      navigate("/", { replace: true });
    },
  });

  const validate = (): boolean => {
    const next: FieldErrors = {};
    if (!email.trim()) next.email = t("auth.emailRequired");
    if (!username.trim()) next.username = t("auth.usernameRequired");
    else if (username.trim().length < 3) next.username = t("auth.usernameMinChars", { count: 3 });
    if (!password) next.password = t("auth.passwordRequired");
    else if (password.length < 6) next.password = t("auth.passwordMinChars", { count: 6 });
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
      : t("errors.generic")
    : null;

  return (
    <AuthLayout
      title={t("auth.createAccount")}
      subtitle={t("auth.registerSubtitle")}
      footer={
        <>
          {t("auth.haveAccount")}{" "}
          <Link to="/login" className="font-medium text-brand transition-colors hover:text-brand-strong">
            {t("auth.signIn")}
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Input
          label={t("auth.email")}
          type="email"
          autoComplete="email"
          placeholder={t("auth.emailPlaceholder")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
        />
        <Input
          label={t("auth.username")}
          type="text"
          autoComplete="username"
          placeholder={t("auth.usernamePlaceholder")}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          error={errors.username}
        />
        <Input
          label={t("auth.password")}
          type="password"
          autoComplete="new-password"
          placeholder={t("auth.passwordPlaceholder")}
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
          {t("auth.createAccount")}
        </Button>
      </form>
    </AuthLayout>
  );
}
