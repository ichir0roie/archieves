"use client";
import Header from "@/components/Header";
import { loadGameId, loadInputMode } from "@/lib/storage";
import {
  Button,
  Card,
  CardContent,
  Container,
  Box,
  Fade,
  Typography,
} from "@mui/material";
import AddCircleRoundedIcon from "@mui/icons-material/AddCircleRounded";
import PlayCircleRoundedIcon from "@mui/icons-material/PlayCircleRounded";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const MODE_PATH = {
  simple: "/game/simple-score-card",
  touch: "/game/score-card",
} as const;

export default function Page() {
  const router = useRouter();
  // localStorage isn't readable during server-side rendering, so whether
  // there is anything to resume is only known once mounted in the browser.
  const [hasGameInProgress, setHasGameInProgress] = useState(false);

  useEffect(() => {
    setHasGameInProgress(loadGameId() !== null);
  }, []);

  function newGame() {
    router.push("/game/setup");
  }
  function continueGame() {
    router.push(MODE_PATH[loadInputMode() ?? "touch"]);
  }

  return (
    <main className="min-h-screen">
      <Header pageName="新しいゲームを開始" showBack />
      <Container
        maxWidth="sm"
        className="flex items-center justify-center min-h-[calc(100vh-56px)] py-8"
      >
        <Fade in timeout={500}>
          <Card
            elevation={0}
            className="w-full rounded-3xl overflow-hidden bg-white/85 backdrop-blur-sm border border-white/60 shadow-xl shadow-indigo-100/60"
          >
            <CardContent className="!p-6">
              <Box className="flex flex-col gap-3">
                <Button
                  variant="contained"
                  size="large"
                  fullWidth
                  startIcon={<AddCircleRoundedIcon />}
                  onClick={newGame}
                  className="!py-3 !rounded-2xl !font-semibold !text-base !normal-case !shadow-lg !shadow-indigo-200"
                >
                  新しいスコア
                </Button>
                <Button
                  variant="outlined"
                  size="large"
                  fullWidth
                  disabled={!hasGameInProgress}
                  startIcon={<PlayCircleRoundedIcon />}
                  onClick={continueGame}
                  className="!py-3 !rounded-2xl !font-semibold !text-base !normal-case"
                >
                  続きから
                </Button>
                {!hasGameInProgress && (
                  <Typography variant="body2" className="!text-center !text-slate-500">
                    記録中のスコアはありません
                  </Typography>
                )}
              </Box>
            </CardContent>
          </Card>
        </Fade>
      </Container>
    </main>
  );
}
