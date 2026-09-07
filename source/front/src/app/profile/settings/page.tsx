"use client";

import AuthGate from "@/components/auth/AuthGate";
import Header from "@/components/templates/common/header";
import ApiErrorAlert from "@/components/templates/common/ApiErrorAlert";
import { useEffect, useState } from "react";
import {
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Container,
  Fade,
  Stack,
  TextField,
} from "@mui/material";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import {
  OrganizationSummary,
  UserRead,
  findOrCreateOrganization,
  getOrganization,
  getUser,
  searchOrganizations,
  toErrorDetails,
  updateUser,
  type ErrorDetails,
} from "@/lib/api";
import { getCurrentAppUser } from "@/lib/auth/currentUser";

export default function Page() {
  const [userId, setUserId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [age, setAge] = useState("");
  const [organizationInputValue, setOrganizationInputValue] = useState("");
  const [organizationId, setOrganizationId] = useState<number | null>(null);
  const [organizationOptions, setOrganizationOptions] = useState<OrganizationSummary[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ErrorDetails | null>(null);
  const [saved, setSaved] = useState(false);

  function applyUser(user: UserRead) {
    setName(user.name);
    setNickname(user.nickname ?? "");
    setAge(user.age !== null ? String(user.age) : "");
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const { id } = await getCurrentAppUser();
        const user = await getUser(id);
        if (cancelled) return;
        setUserId(id);
        applyUser(user);
        if (user.organization_id !== null) {
          const organization = await getOrganization(user.organization_id);
          if (!cancelled) {
            setOrganizationId(organization.id);
            setOrganizationInputValue(organization.name);
          }
        }
      } catch (e) {
        if (!cancelled) setError(toErrorDetails(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const text = organizationInputValue.trim();
    if (text === "") {
      setOrganizationOptions([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const results = await searchOrganizations(text);
        if (!cancelled) setOrganizationOptions(results);
      } catch {
        if (!cancelled) setOrganizationOptions([]);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [organizationInputValue]);

  async function resolveOrganizationId(): Promise<number | null> {
    const text = organizationInputValue.trim();
    if (text === "") return null;
    if (organizationId !== null) return organizationId;
    const organization = await findOrCreateOrganization({ name: text });
    return organization.id;
  }

  async function handleSave() {
    if (userId === null) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const resolvedOrganizationId = await resolveOrganizationId();
      const updated = await updateUser(userId, {
        name,
        nickname: nickname || null,
        age: age === "" ? null : Number(age),
        organization_id: resolvedOrganizationId,
      });
      applyUser(updated);
      setOrganizationId(resolvedOrganizationId);
      setSaved(true);
    } catch (e) {
      setError(toErrorDetails(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AuthGate>
      <main className="min-h-screen w-full bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
        <Header pageName="プロフィール設定" showBack />
        <Container maxWidth="sm" className="py-8">
          {loading ? (
            <div className="rounded-2xl border border-slate-200 bg-white/90 p-6 text-center text-sm text-slate-500 shadow-sm">
              読み込み中...
            </div>
          ) : (
            <Fade in timeout={400}>
              <Card
                elevation={0}
                className="w-full rounded-3xl overflow-hidden bg-white/85 backdrop-blur-sm border border-white/60 shadow-xl shadow-indigo-100/60"
              >
                <CardContent className="!p-6">
                  <Stack spacing={2.5}>
                    {error && <ApiErrorAlert error={error} />}
                    {saved && !error && (
                      <div className="rounded-xl bg-green-50 px-4 py-2 text-sm font-medium text-green-700">
                        保存しました
                      </div>
                    )}

                    <TextField
                      label="名前"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      fullWidth
                      required
                    />
                    <TextField
                      label="ニックネーム"
                      value={nickname}
                      onChange={(e) => setNickname(e.target.value)}
                      fullWidth
                    />
                    <TextField
                      label="年齢"
                      type="number"
                      value={age}
                      onChange={(e) => setAge(e.target.value)}
                      fullWidth
                    />
                    <Autocomplete
                      freeSolo
                      options={organizationOptions}
                      getOptionLabel={(option) =>
                        typeof option === "string" ? option : option.name
                      }
                      isOptionEqualToValue={(option, value) =>
                        typeof option !== "string" &&
                        typeof value !== "string" &&
                        option.id === value.id
                      }
                      inputValue={organizationInputValue}
                      onInputChange={(_, newValue, reason) => {
                        setOrganizationInputValue(newValue);
                        if (reason === "input") {
                          setOrganizationId(null);
                        }
                      }}
                      onChange={(_, newValue) => {
                        if (newValue !== null && typeof newValue !== "string") {
                          setOrganizationId(newValue.id);
                          setOrganizationInputValue(newValue.name);
                        }
                      }}
                      renderInput={(params) => (
                        <TextField {...params} label="所属" fullWidth />
                      )}
                    />

                    <Box className="pt-2">
                      <Button
                        variant="contained"
                        size="large"
                        fullWidth
                        startIcon={<SaveRoundedIcon />}
                        onClick={handleSave}
                        disabled={saving || !name}
                        className="!py-3 !rounded-2xl !font-semibold !text-base !normal-case !shadow-lg !shadow-indigo-200"
                      >
                        {saving ? "保存中..." : "保存"}
                      </Button>
                    </Box>
                  </Stack>
                </CardContent>
              </Card>
            </Fade>
          )}
        </Container>
      </main>
    </AuthGate>
  );
}
