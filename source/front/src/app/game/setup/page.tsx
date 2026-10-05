"use client";

import Header from "@/components/Header";
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
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import DialpadRoundedIcon from "@mui/icons-material/DialpadRounded";
import TouchAppRoundedIcon from "@mui/icons-material/TouchAppRounded";
import {
  DEFAULT_ROUND_SETUP,
  MAX_DISTANCE_M,
  MAX_END_SIZE,
  MAX_GAME_SIZE,
  MAX_ROUND_SIZE,
  MIN_DISTANCE_M,
  MIN_END_SIZE,
  MIN_GAME_SIZE,
  MIN_ROUND_SIZE,
  TARGET_TYPES,
  type RoundSetup,
} from "@/lib/score/scoreConfig";
import {
  clearGameId,
  loadRoundSetup,
  markNewGameStart,
  saveInputMode,
  saveRoundSetup,
  type InputMode,
} from "@/lib/storage";

interface CountFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min: number;
  max: number;
  helperText: string;
}

/**
 * Kept as text rather than a number so an emptied field stays empty instead
 * of collapsing to 0 and starting a game with no ends in it.
 */
function CountField(props: CountFieldProps) {
  const invalid = !isCount(props.value, props.min, props.max);

  return (
    <TextField
      label={props.label}
      type="number"
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
      error={invalid}
      helperText={invalid ? `${props.min}〜${props.max}の整数で入力してください` : props.helperText}
      slotProps={{ htmlInput: { min: props.min, max: props.max, step: 1 } }}
      fullWidth
    />
  );
}

function isCount(raw: string, min: number, max: number): boolean {
  const value = Number(raw);
  return raw.trim() !== "" && Number.isInteger(value) && value >= min && value <= max;
}

export default function Page() {
  const router = useRouter();

  const [distance, setDistance] = useState(String(DEFAULT_ROUND_SETUP.distanceM));
  const [targetTypeId, setTargetTypeId] = useState(DEFAULT_ROUND_SETUP.targetType);
  const [endSize, setEndSize] = useState(String(DEFAULT_ROUND_SETUP.endSize));
  const [roundSize, setRoundSize] = useState(String(DEFAULT_ROUND_SETUP.roundSize));
  const [gameSize, setGameSize] = useState(String(DEFAULT_ROUND_SETUP.gameSize));

  // localStorage isn't available during server-side rendering, so the last
  // used setup (if any) is only applied once mounted in the browser.
  useEffect(() => {
    const saved = loadRoundSetup();
    if (!saved) return;
    setDistance(String(saved.distanceM));
    setTargetTypeId(saved.targetType);
    setEndSize(String(saved.endSize));
    setRoundSize(String(saved.roundSize));
    setGameSize(String(saved.gameSize));
  }, []);

  const isValid =
    isCount(distance, MIN_DISTANCE_M, MAX_DISTANCE_M) &&
    isCount(endSize, MIN_END_SIZE, MAX_END_SIZE) &&
    isCount(roundSize, MIN_ROUND_SIZE, MAX_ROUND_SIZE) &&
    isCount(gameSize, MIN_GAME_SIZE, MAX_GAME_SIZE);

  const totalArrows = Number(endSize) * Number(roundSize) * Number(gameSize);

  function start(mode: InputMode) {
    if (!isValid) return;
    const setup: RoundSetup = {
      distanceM: Number(distance),
      targetType: targetTypeId,
      endSize: Number(endSize),
      roundSize: Number(roundSize),
      gameSize: Number(gameSize),
    };
    saveRoundSetup(setup);
    saveInputMode(mode);
    // Setup always starts a fresh game; "続きから" bypasses this screen.
    clearGameId();
    markNewGameStart();
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
                <CountField
                  label="距離 (m)"
                  value={distance}
                  onChange={setDistance}
                  min={MIN_DISTANCE_M}
                  max={MAX_DISTANCE_M}
                  helperText="的までの距離"
                />
                <Box>
                  <Typography variant="body2" className="!mb-1 !text-slate-600">
                    的の種類
                  </Typography>
                  <ToggleButtonGroup
                    value={targetTypeId}
                    exclusive
                    fullWidth
                    onChange={(_, value) => {
                      if (value) setTargetTypeId(value);
                    }}
                  >
                    {TARGET_TYPES.map((targetType) => (
                      <ToggleButton key={targetType.id} value={targetType.id}>
                        {targetType.label}
                      </ToggleButton>
                    ))}
                  </ToggleButtonGroup>
                </Box>
                <CountField
                  label="1エンドの矢数"
                  value={endSize}
                  onChange={setEndSize}
                  min={MIN_END_SIZE}
                  max={MAX_END_SIZE}
                  helperText="1エンドで射つ矢の本数(屋外は6本、インドアは3本)"
                />
                <CountField
                  label="エンド数"
                  value={roundSize}
                  onChange={setRoundSize}
                  min={MIN_ROUND_SIZE}
                  max={MAX_ROUND_SIZE}
                  helperText="1ラウンドのエンド数"
                />
                <CountField
                  label="ラウンド数"
                  value={gameSize}
                  onChange={setGameSize}
                  min={MIN_GAME_SIZE}
                  max={MAX_GAME_SIZE}
                  helperText="この記録に含めるラウンド数"
                />

                {isValid && (
                  <Typography
                    variant="body2"
                    className="SetupSummary !text-slate-600"
                  >
                    合計 {totalArrows}本 ({endSize}本 × {roundSize}エンド × {gameSize}
                    ラウンド)
                  </Typography>
                )}

                <Box className="flex flex-col gap-3 pt-2">
                  <Button
                    variant="contained"
                    size="large"
                    fullWidth
                    disabled={!isValid}
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
                    disabled={!isValid}
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
