"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AuthGate from "@/components/auth/AuthGate";
import Navigation from "@/components/templates/common/Navigation";
import MonthDashboard from "@/components/templates/home/MonthDashboard";
import Button from "@mui/material/Button";
import { Box, Card, CardContent, Fade, Stack } from "@mui/material";
import SportsScoreRoundedIcon from "@mui/icons-material/SportsScoreRounded";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import TrackChangesRoundedIcon from "@mui/icons-material/TrackChangesRounded";
import EmojiEventsRoundedIcon from "@mui/icons-material/EmojiEventsRounded";
import { UserRead, getMyUser } from "@/lib/api";

export default function App() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<UserRead | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMyUser()
      .then((user) => {
        if (!cancelled) setCurrentUser(user);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AuthGate>
      {({ signOut }) => (
        <main className="min-h-screen w-full bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
          <Navigation />
          <div className="flex flex-col items-center gap-6 px-4 py-10 md:pl-60">
            <Fade in timeout={500}>
              <Stack
                spacing={3}
                alignItems="center"
                className="w-full max-w-sm md:hidden"
              >
                <Stack spacing={1} alignItems="center" textAlign="center">
                  <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-500 shadow-lg shadow-indigo-200">
                    <TrackChangesRoundedIcon
                      className="!text-white"
                      fontSize="large"
                    />
                  </div>
                  <h1 className="text-2xl font-bold text-slate-800">
                    Archieves
                  </h1>
                </Stack>
              </Stack>
            </Fade>

            <p className="text-sm text-slate-500 md:mt-2">
              {currentUser
                ? `ようこそ、${currentUser.name} さん`
                : "スコアを記録・管理しよう"}
            </p>

            <Card
              elevation={0}
              className="w-full max-w-sm rounded-3xl overflow-hidden bg-white/85 backdrop-blur-sm border border-white/60 shadow-xl shadow-indigo-100/60"
            >
              <CardContent className="!p-6">
                <Box className="flex flex-col gap-3">
                  <Button
                    variant="contained"
                    size="large"
                    fullWidth
                    startIcon={<SportsScoreRoundedIcon />}
                    onClick={() => router.push("/game")}
                    className="!py-3 !rounded-2xl !font-semibold !text-base !normal-case !shadow-lg !shadow-indigo-200"
                  >
                    スコア記録を開始
                  </Button>
                  <Button
                    variant="outlined"
                    size="large"
                    fullWidth
                    startIcon={<EmojiEventsRoundedIcon />}
                    onClick={() => router.push("/profile/matches")}
                    className="!py-3 !rounded-2xl !font-semibold !text-base !normal-case"
                  >
                    大会情報の登録
                  </Button>
                  <Button
                    variant="text"
                    size="large"
                    fullWidth
                    onClick={() => router.push("/profile/settings")}
                    className="!py-3 !rounded-2xl !font-semibold !text-base !normal-case"
                  >
                    プロフィール設定
                  </Button>
                </Box>
              </CardContent>
            </Card>

            <div className="w-full max-w-3xl">
              <MonthDashboard />
            </div>

            <Button
              size="small"
              startIcon={<LogoutRoundedIcon fontSize="small" />}
              onClick={signOut}
              className="!text-slate-400 !normal-case hover:!bg-transparent hover:!text-slate-600"
            >
              サインアウト
            </Button>
          </div>
        </main>
      )}
    </AuthGate>
  );
}
