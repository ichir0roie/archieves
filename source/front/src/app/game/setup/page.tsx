"use client";

import Header from "@/components/templates/common/header";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Container,
  Fade,
  Stack,
  TextField,
} from "@mui/material";
import DialpadRoundedIcon from "@mui/icons-material/DialpadRounded";
import TouchAppRoundedIcon from "@mui/icons-material/TouchAppRounded";
import {
  DEFAULT_ROUND_SIZE,
  DEFAULT_DISTANCE_M,
  DEFAULT_TARGET_SIZE,
  MAX_ROUNDS,
  type RoundSetup,
} from "@/modules/data/score/scoreConfig";
import {
  clearGameId,
  loadRoundSetup,
  saveInputMode,
  saveRoundSetup,
  type InputMode,
} from "@/modules/functions/localStorage";

/** "70m" -> 70; falls back when the stored value isn't a plain number + unit. */
function numberFromUnitString(value: string, fallback: number): number {
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? fallback : n;
}

export default function Page() {
  const router = useRouter();

  const [distance, setDistance] = useState(DEFAULT_DISTANCE_M);
  const [targetSize, setTargetSize] = useState(
    numberFromUnitString(DEFAULT_TARGET_SIZE, 122)
  );
  const [roundSize, setRoundSize] = useState(DEFAULT_ROUND_SIZE);
  const [gameSize, setGameSize] = useState(MAX_ROUNDS);

  // localStorage isn't available during server-side rendering, so the last
  // used setup (if any) is only applied once mounted in the browser.
  useEffect(() => {
    const saved = loadRoundSetup();
    if (!saved) return;
    setDistance(saved.distanceM);
    setTargetSize(numberFromUnitString(saved.targetType, 122));
    setRoundSize(saved.roundSize);
    setGameSize(saved.gameSize);
  }, []);

  function start(mode: InputMode) {
    const setup: RoundSetup = {
      distanceM: distance,
      targetType: `${targetSize}cm`,
      roundSize,
      gameSize,
    };
    saveRoundSetup(setup);
    saveInputMode(mode);
    // Setup always starts a fresh game; "続きから" bypasses this screen.
    clearGameId();
    router.push(mode === "simple" ? "/game/simple-score-card" : "/game/score-card");
  }

  return (
    <main className="min-h-screen">
      <Header pageName="記録の設定" showBack />
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
              <Stack spacing={2.5}>
                <TextField
                  label="距離 (m)"
                  type="number"
                  value={distance}
                  onChange={(e) => setDistance(Number(e.target.value))}
                  fullWidth
                />
                <TextField
                  label="的の大きさ (cm)"
                  type="number"
                  value={targetSize}
                  onChange={(e) => setTargetSize(Number(e.target.value))}
                  fullWidth
                />
                <TextField
                  label="エンド数"
                  type="number"
                  value={roundSize}
                  onChange={(e) => setRoundSize(Number(e.target.value))}
                  fullWidth
                />
                <TextField
                  label="ラウンド数"
                  type="number"
                  value={gameSize}
                  onChange={(e) => setGameSize(Number(e.target.value))}
                  fullWidth
                />

                <Box className="flex flex-col gap-3 pt-2">
                  <Button
                    variant="contained"
                    size="large"
                    fullWidth
                    startIcon={<DialpadRoundedIcon />}
                    onClick={() => start("simple")}
                    className="!py-3 !rounded-2xl !font-semibold !text-base !normal-case !shadow-lg !shadow-indigo-200"
                  >
                    点数だけ入力
                  </Button>
                  <Button
                    variant="outlined"
                    size="large"
                    fullWidth
                    startIcon={<TouchAppRoundedIcon />}
                    onClick={() => start("touch")}
                    className="!py-3 !rounded-2xl !font-semibold !text-base !normal-case"
                  >
                    的をタッチして入力
                  </Button>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Fade>
      </Container>
    </main>
  );
}
