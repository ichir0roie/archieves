"use client";

import { useState } from "react";
import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  TextField,
} from "@mui/material";
import ChatBubbleOutlineRoundedIcon from "@mui/icons-material/ChatBubbleOutlineRounded";
import { MAX_COMMENT_LENGTH } from "@/lib/comment";

interface Props {
  /** What the comment is attached to, e.g. "END 3" - shown as the modal's title. */
  title: string;
  /** The comment already stored for this game/round/end, if any. */
  body: string | null;
  /**
   * Called with the edited text; an empty string means "remove the
   * comment". Rejecting leaves the editor open with the text still in it.
   */
  onSave: (body: string) => void | Promise<void>;
  disabled?: boolean;
  /** Stands in for the text while no comment is stored yet. */
  emptyText?: string;
  className?: string;
}

/**
 * One comment, shown as the icon that opens its editor plus the text
 * itself: the icon sits on the left, the stored text reads next to it.
 * Pressing the icon pops up a modal preloaded with that same text, so
 * saving updates the comment that is already there instead of adding
 * another one.
 */
export default function CommentField(props: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  function openEditor() {
    setDraft(props.body ?? "");
    setOpen(true);
  }

  async function save() {
    setSaving(true);
    try {
      await props.onSave(draft.trim());
      setOpen(false);
    } catch {
      // The screen behind the modal reports what went wrong; the editor
      // stays open with the text so it isn't lost to a failed request.
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`CommentField flex min-w-0 items-center gap-1 ${props.className ?? ""}`}>
      <IconButton
        size="small"
        aria-label={`${props.title}のコメントを入力`}
        disabled={props.disabled}
        onClick={openEditor}
        className="shrink-0"
      >
        <ChatBubbleOutlineRoundedIcon
          fontSize="small"
          color={props.body ? "primary" : "disabled"}
        />
      </IconButton>
      <span
        className={`CommentText min-w-0 flex-1 truncate text-left text-xs ${
          props.body ? "text-slate-700" : "text-slate-400"
        }`}
      >
        {props.body ?? props.emptyText ?? ""}
      </span>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{props.title}のコメント</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            multiline
            minRows={4}
            margin="dense"
            label="コメント"
            value={draft}
            slotProps={{ htmlInput: { maxLength: MAX_COMMENT_LENGTH } }}
            onChange={(event) => setDraft(event.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={saving}>
            キャンセル
          </Button>
          <Button
            variant="contained"
            onClick={save}
            disabled={saving}
            startIcon={saving ? <CircularProgress size={16} /> : undefined}
          >
            保存
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
