"use client";
import Header from "@/components/templates/common/header";
import { loadInputMode } from "@/modules/functions/localStorage";
import {
  Button,
  Card,
  CardContent,
  Container,
  Box,
  Fade,
} from "@mui/material";
import AddCircleRoundedIcon from "@mui/icons-material/AddCircleRounded";
import PlayCircleRoundedIcon from "@mui/icons-material/PlayCircleRounded";
import { useRouter } from "next/navigation";

const MODE_PATH = {
  simple: "/game/simple-score-card",
  touch: "/game/score-card",
} as const;

export default function Page() {
  const router = useRouter();

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
                  startIcon={<PlayCircleRoundedIcon />}
                  onClick={continueGame}
                  className="!py-3 !rounded-2xl !font-semibold !text-base !normal-case"
                >
                  続きから
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Fade>
      </Container>
    </main>
  );
}
