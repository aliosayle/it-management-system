import { useCallback, useEffect, useState } from "react";
import Button from "devextreme-react/button";
import SelectBox from "devextreme-react/select-box";
import TextArea from "devextreme-react/text-area";
import TextBox from "devextreme-react/text-box";
import DateBox from "devextreme-react/date-box";
import notify from "devextreme/ui/notify";
import { apiFetch, apiFetchBlob } from "../../api/client";
import { getErrorMessage } from "../../utils/error-message";
import {
  TASK_PRIORITY_OPTIONS,
  TASK_STATUS_OPTIONS,
  taskPriorityLabel,
  taskStatusLabel,
} from "../../constants/task-enums";

export type TaskViewerRole = "manager" | "assignee" | "observer";

export type TaskActivity = {
  id: string;
  type: string;
  body: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  createdAt: string;
  createdByName: string;
};

export type TaskFollowUp = {
  id: string;
  scheduledAt: string;
  completedAt: string | null;
  note: string | null;
  assigneeId: string;
  assigneeName: string;
  createdByName: string;
};

export type TaskAttachment = {
  id: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
  uploadedById: string;
  uploadedByName: string;
};

export type TaskDetailData = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueAt: string | null;
  completedAt: string | null;
  createdById: string;
  assigneeId: string;
  createdByName: string;
  assigneeName: string;
  viewerRole: TaskViewerRole;
  followUps: TaskFollowUp[];
  activities: TaskActivity[];
  attachments: TaskAttachment[];
};

type UserOption = { id: string; label: string };

type Props = {
  detail: TaskDetailData;
  userId: string | undefined;
  userOptions: UserOption[];
  canDelete: boolean;
  onReload: () => Promise<void>;
  onDeleted: () => void;
  onSaved: () => void;
};

function activityLine(a: TaskActivity): string {
  if (a.type === "COMMENT") return a.body ?? "";
  if (a.type === "STATUS_CHANGE" && a.toStatus) {
    return `Status → ${taskStatusLabel(a.toStatus)}`;
  }
  if (a.type === "ATTACHMENT_ADDED") return a.body ?? "Photo added";
  return a.body ?? a.type.replace(/_/g, " ").toLowerCase();
}

function TaskPhotoGallery({
  taskId,
  attachments,
  canUpload,
  canDeleteAny,
  userId,
  onChanged,
}: {
  taskId: string;
  attachments: TaskAttachment[];
  canUpload: boolean;
  canDeleteAny: boolean;
  userId: string | undefined;
  onChanged: () => void;
}) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const created: string[] = [];
    const load = async () => {
      const next: Record<string, string> = {};
      for (const a of attachments) {
        if (!a.mimeType.startsWith("image/")) continue;
        try {
          const blob = await apiFetchBlob(
            `/api/tasks/${taskId}/attachments/${a.id}/file`,
          );
          const url = URL.createObjectURL(blob);
          created.push(url);
          next[a.id] = url;
        } catch {
          /* skip */
        }
      }
      if (!cancelled) setUrls(next);
    };
    void load();
    return () => {
      cancelled = true;
      for (const u of created) URL.revokeObjectURL(u);
      setUrls((prev) => {
        for (const u of Object.values(prev)) URL.revokeObjectURL(u);
        return {};
      });
    };
  }, [taskId, attachments]);

  const uploadPhoto = async (file: File) => {
    setUploading(true);
    const fd = new FormData();
    fd.append("photo", file);
    try {
      await apiFetch(`/api/tasks/${taskId}/attachments`, {
        method: "POST",
        body: fd,
      });
      notify("Photo uploaded", "success", 2000);
      onChanged();
    } catch (e: unknown) {
      notify(getErrorMessage(e, "Upload failed"), "error", 5000);
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = async (attachmentId: string) => {
    if (!window.confirm("Remove this photo?")) return;
    try {
      await apiFetch(`/api/tasks/${taskId}/attachments/${attachmentId}`, {
        method: "DELETE",
      });
      onChanged();
    } catch (e: unknown) {
      notify(getErrorMessage(e, "Failed to remove photo"), "error", 5000);
    }
  };

  return (
    <div className="task-detail__section">
      <h3>Photos</h3>
      {attachments.length === 0 && !canUpload ? (
        <p className="task-detail__muted">No photos yet.</p>
      ) : null}
      <ul className="task-photo-grid">
        {attachments.map((a) => (
          <li key={a.id}>
            {urls[a.id] ? (
              <a href={urls[a.id]} target="_blank" rel="noreferrer">
                <img src={urls[a.id]} alt={a.originalName} />
              </a>
            ) : (
              <span className="task-photo-grid__placeholder">{a.originalName}</span>
            )}
            <span className="task-photo-grid__meta">
              {a.uploadedByName} · {new Date(a.createdAt).toLocaleString()}
            </span>
            {(canDeleteAny || a.uploadedById === userId) && (
              <Button
                text="Remove"
                stylingMode="text"
                onClick={() => void removePhoto(a.id)}
              />
            )}
          </li>
        ))}
      </ul>
      {canUpload ? (
        <div className="task-photo-upload">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void uploadPhoto(file);
              e.target.value = "";
            }}
          />
          {uploading ? <span className="task-detail__muted">Uploading…</span> : null}
        </div>
      ) : null}
    </div>
  );
}

function TaskActivitySection({
  activities,
  canComment,
  commentText,
  setCommentText,
  onPostComment,
}: {
  activities: TaskActivity[];
  canComment: boolean;
  commentText: string;
  setCommentText: (v: string) => void;
  onPostComment: () => void;
}) {
  return (
    <div className="task-detail__section">
      <h3>Activity</h3>
      <ul className="task-activity-list">
        {activities.map((a) => (
          <li key={a.id}>
            <span className="task-activity-list__meta">
              {new Date(a.createdAt).toLocaleString()} · {a.createdByName}
              {a.type === "COMMENT"
                ? ""
                : ` · ${a.type.replace(/_/g, " ").toLowerCase()}`}
            </span>
            <span className="task-activity-list__body">{activityLine(a)}</span>
          </li>
        ))}
      </ul>
      {canComment ? (
        <div className="task-comment-form">
          <TextArea
            height={72}
            placeholder="Add a comment…"
            value={commentText}
            onValueChanged={(e) => setCommentText(String(e.value ?? ""))}
          />
          <Button
            text="Post comment"
            stylingMode="contained"
            type="default"
            onClick={onPostComment}
          />
        </div>
      ) : null}
    </div>
  );
}

function TaskFollowUpsSection({
  followUps,
  userId,
  isManager,
  isAssignee,
  followUpDate,
  setFollowUpDate,
  followUpNote,
  setFollowUpNote,
  onSchedule,
  onComplete,
}: {
  followUps: TaskFollowUp[];
  userId: string | undefined;
  isManager: boolean;
  isAssignee: boolean;
  followUpDate: Date | null;
  setFollowUpDate: (d: Date | null) => void;
  followUpNote: string;
  setFollowUpNote: (s: string) => void;
  onSchedule: () => void;
  onComplete: (id: string) => void;
}) {
  const canComplete = (f: TaskFollowUp) =>
    !f.completedAt && (isManager || f.assigneeId === userId || isAssignee);

  if (followUps.length === 0 && !isManager) {
    return null;
  }

  return (
    <div className="task-detail__section">
      <h3>Follow-ups</h3>
      <ul className="task-follow-up-list">
        {followUps.map((f) => (
          <li key={f.id} className={f.completedAt ? "is-done" : ""}>
            <span>
              {new Date(f.scheduledAt).toLocaleString()} — {f.assigneeName}
              {f.note ? `: ${f.note}` : ""}
            </span>
            {canComplete(f) ? (
              <Button
                text="Complete"
                stylingMode="text"
                onClick={() => onComplete(f.id)}
              />
            ) : null}
          </li>
        ))}
      </ul>
      {isManager ? (
        <div className="task-follow-up-form">
          <DateBox
            type="datetime"
            placeholder="Follow-up date"
            value={followUpDate}
            onValueChanged={(e) => setFollowUpDate((e.value as Date) ?? null)}
          />
          <TextBox
            placeholder="Note (optional)"
            value={followUpNote}
            onValueChanged={(e) => setFollowUpNote(String(e.value ?? ""))}
          />
          <Button
            text="Schedule"
            type="default"
            stylingMode="contained"
            onClick={onSchedule}
          />
        </div>
      ) : null}
    </div>
  );
}

export function TaskDetailPanel({
  detail,
  userId,
  userOptions,
  canDelete,
  onReload,
  onDeleted,
  onSaved,
}: Props) {
  const [localDetail, setLocalDetail] = useState(detail);
  const [saving, setSaving] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [followUpDate, setFollowUpDate] = useState<Date | null>(null);
  const [followUpNote, setFollowUpNote] = useState("");

  useEffect(() => {
    setLocalDetail(detail);
  }, [detail]);

  const submitForReview = useCallback(async () => {
    if (localDetail.attachments.length === 0) {
      notify("Upload at least one photo before submitting for review.", "warning", 4500);
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/api/tasks/${detail.id}/submit-for-review`, {
        method: "POST",
      });
      notify("Submitted for review", "success", 2500);
      onSaved();
      await onReload();
    } catch (e: unknown) {
      notify(getErrorMessage(e, "Failed to submit for review"), "error", 5000);
    } finally {
      setSaving(false);
    }
  }, [detail.id, localDetail.attachments.length, onReload, onSaved]);

  const saveManager = useCallback(async () => {
    setSaving(true);
    try {
      await apiFetch(`/api/tasks/${localDetail.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: localDetail.title,
          description: localDetail.description,
          status: localDetail.status,
          priority: localDetail.priority,
          dueAt: localDetail.dueAt,
          assigneeId: localDetail.assigneeId,
        }),
      });
      notify("Task saved", "success", 2000);
      onSaved();
      await onReload();
    } catch (e: unknown) {
      notify(getErrorMessage(e, "Failed to save task"), "error", 5000);
    } finally {
      setSaving(false);
    }
  }, [localDetail, onReload, onSaved]);

  const postComment = useCallback(async () => {
    if (!commentText.trim()) return;
    try {
      await apiFetch(`/api/tasks/${detail.id}/comments`, {
        method: "POST",
        body: JSON.stringify({ body: commentText.trim() }),
      });
      setCommentText("");
      await onReload();
    } catch (e: unknown) {
      notify(getErrorMessage(e, "Failed to add comment"), "error", 5000);
    }
  }, [commentText, detail.id, onReload]);

  const scheduleFollowUp = useCallback(async () => {
    if (!followUpDate) {
      notify("Pick a follow-up date and time.", "warning", 4000);
      return;
    }
    try {
      await apiFetch(`/api/tasks/${detail.id}/follow-ups`, {
        method: "POST",
        body: JSON.stringify({
          scheduledAt: followUpDate,
          note: followUpNote.trim() || null,
        }),
      });
      setFollowUpDate(null);
      setFollowUpNote("");
      notify("Follow-up scheduled", "success", 2000);
      await onReload();
    } catch (e: unknown) {
      notify(getErrorMessage(e, "Failed to schedule follow-up"), "error", 5000);
    }
  }, [detail.id, followUpDate, followUpNote, onReload]);

  const completeFollowUp = useCallback(
    async (followUpId: string) => {
      try {
        await apiFetch(`/api/tasks/${detail.id}/follow-ups/${followUpId}`, {
          method: "PATCH",
        });
        await onReload();
      } catch (e: unknown) {
        notify(getErrorMessage(e, "Failed to complete follow-up"), "error", 5000);
      }
    },
    [detail.id, onReload],
  );

  const deleteTask = useCallback(async () => {
    if (!window.confirm(`Delete task "${localDetail.title}"?`)) return;
    try {
      await apiFetch(`/api/tasks/${localDetail.id}`, { method: "DELETE" });
      notify("Task deleted", "success", 2000);
      onDeleted();
    } catch (e: unknown) {
      notify(getErrorMessage(e, "Failed to delete task"), "error", 5000);
    }
  }, [localDetail, onDeleted]);

  const markManagerComplete = () => {
    setLocalDetail((d) => (d ? { ...d, status: "DONE" } : d));
    void (async () => {
      setSaving(true);
      try {
        await apiFetch(`/api/tasks/${localDetail.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "DONE" }),
        });
        notify("Task marked complete", "success", 2000);
        onSaved();
        await onReload();
      } catch (e: unknown) {
        notify(getErrorMessage(e, "Failed to complete task"), "error", 5000);
      } finally {
        setSaving(false);
      }
    })();
  };

  const followUpProps = {
    followUps: localDetail.followUps,
    userId,
    followUpDate,
    setFollowUpDate,
    followUpNote,
    setFollowUpNote,
    onSchedule: () => void scheduleFollowUp(),
    onComplete: (id: string) => void completeFollowUp(id),
  };

  const activityProps = {
    activities: localDetail.activities,
    canComment: true,
    commentText,
    setCommentText,
    onPostComment: () => void postComment(),
  };

  const photoProps = {
    taskId: localDetail.id,
    attachments: localDetail.attachments,
    userId,
    onChanged: () => void onReload(),
  };

  if (localDetail.viewerRole === "assignee") {
    const isClosed =
      localDetail.status === "DONE" || localDetail.status === "CANCELLED";
    const awaitingReview = localDetail.status === "PENDING_REVIEW";
    const canSubmit = !isClosed && !awaitingReview;

    return (
      <div className="task-detail task-detail--assignee">
        <div className="task-detail__summary">
          <h2 className="task-detail__title">{localDetail.title}</h2>
          <p className="task-detail__assigned-you">Assigned to you</p>
          <div className="task-detail__meta-row">
            <span className="task-detail__badge">
              {taskStatusLabel(localDetail.status)}
            </span>
            <span className="task-detail__badge">
              {taskPriorityLabel(localDetail.priority)}
            </span>
          </div>
          {localDetail.dueAt ? (
            <p className="task-detail__due-line">
              Complete by{" "}
              <strong>{new Date(localDetail.dueAt).toLocaleString()}</strong>
            </p>
          ) : (
            <p className="task-detail__due-line">No due date set</p>
          )}
          <p className="task-detail__muted">
            Assigned by {localDetail.createdByName}
          </p>
          {localDetail.description ? (
            <p className="task-detail__description">{localDetail.description}</p>
          ) : null}
        </div>

        {awaitingReview ? (
          <div className="task-detail__banner task-detail__banner--waiting">
            Waiting for {localDetail.createdByName} to review your submission and
            complete this task.
          </div>
        ) : canSubmit ? (
          <div className="task-detail__banner task-detail__banner--assignee">
            Upload photos of your work below, then submit for review when you are
            finished.
          </div>
        ) : null}

        <TaskPhotoGallery
          {...photoProps}
          canUpload={canSubmit}
          canDeleteAny={false}
        />

        {canSubmit ? (
          <div className="task-detail__actions task-detail__actions--submit">
            <Button
              text="Submit for review"
              type="default"
              stylingMode="contained"
              disabled={saving}
              onClick={() => void submitForReview()}
            />
          </div>
        ) : null}

        <TaskActivitySection {...activityProps} />
      </div>
    );
  }

  if (localDetail.viewerRole === "manager") {
    return (
      <div className="task-detail task-detail--manager">
        {localDetail.status === "PENDING_REVIEW" ? (
          <div className="task-detail__banner task-detail__banner--review">
            {localDetail.assigneeName} submitted this task for review. Check the
            photos and activity, then mark it complete.
          </div>
        ) : null}
        <div className="task-detail__fields">
          <div className="task-detail__row">
            <label>Title</label>
            <TextBox
              value={localDetail.title}
              onValueChanged={(e) =>
                setLocalDetail((d) =>
                  d ? { ...d, title: String(e.value ?? "") } : d,
                )
              }
            />
          </div>
          <div className="task-detail__row task-detail__row--cols">
            <div>
              <label>Status</label>
              <SelectBox
                dataSource={[...TASK_STATUS_OPTIONS]}
                displayExpr="text"
                valueExpr="value"
                value={localDetail.status}
                onValueChanged={(e) =>
                  setLocalDetail((d) =>
                    d ? { ...d, status: String(e.value) } : d,
                  )
                }
              />
            </div>
            <div>
              <label>Priority</label>
              <SelectBox
                dataSource={[...TASK_PRIORITY_OPTIONS]}
                displayExpr="text"
                valueExpr="value"
                value={localDetail.priority}
                onValueChanged={(e) =>
                  setLocalDetail((d) =>
                    d ? { ...d, priority: String(e.value) } : d,
                  )
                }
              />
            </div>
            <div>
              <label>Due</label>
              <DateBox
                type="datetime"
                value={localDetail.dueAt ? new Date(localDetail.dueAt) : null}
                showClearButton
                onValueChanged={(e) =>
                  setLocalDetail((d) =>
                    d
                      ? {
                          ...d,
                          dueAt: e.value
                            ? (e.value as Date).toISOString()
                            : null,
                        }
                      : d,
                  )
                }
              />
            </div>
          </div>
          <div className="task-detail__row">
            <label>Assignee</label>
            <SelectBox
              dataSource={userOptions}
              displayExpr="label"
              valueExpr="id"
              value={localDetail.assigneeId}
              searchEnabled
              onValueChanged={(e) =>
                setLocalDetail((d) =>
                  d ? { ...d, assigneeId: e.value as string } : d,
                )
              }
            />
          </div>
          <div className="task-detail__row">
            <label>Description</label>
            <TextArea
              height={80}
              value={localDetail.description ?? ""}
              onValueChanged={(e) =>
                setLocalDetail((d) =>
                  d ? { ...d, description: String(e.value ?? "") } : d,
                )
              }
            />
          </div>
          <div className="task-detail__actions">
            <Button
              text="Save"
              type="default"
              stylingMode="contained"
              disabled={saving}
              onClick={() => void saveManager()}
            />
            <Button
              text="Mark complete"
              stylingMode="outlined"
              disabled={saving || localDetail.status === "DONE"}
              onClick={markManagerComplete}
            />
            {canDelete || localDetail.createdById === userId ? (
              <Button
                text="Delete"
                stylingMode="outlined"
                onClick={() => void deleteTask()}
              />
            ) : null}
          </div>
        </div>
        <TaskPhotoGallery {...photoProps} canUpload canDeleteAny />
        <TaskFollowUpsSection {...followUpProps} isManager isAssignee={false} />
        <TaskActivitySection {...activityProps} />
      </div>
    );
  }

  return (
    <div className="task-detail task-detail--observer">
      <div className="task-detail__summary">
        <h2 className="task-detail__title">{localDetail.title}</h2>
        <div className="task-detail__meta-row">
          <span className="task-detail__badge">
            {taskStatusLabel(localDetail.status)}
          </span>
          <span className="task-detail__badge">
            {taskPriorityLabel(localDetail.priority)}
          </span>
        </div>
        <p className="task-detail__muted">
          {localDetail.createdByName} → {localDetail.assigneeName}
        </p>
        {localDetail.description ? (
          <p className="task-detail__description">{localDetail.description}</p>
        ) : null}
      </div>
      <TaskPhotoGallery {...photoProps} canUpload={false} canDeleteAny={false} />
      <TaskFollowUpsSection
        {...followUpProps}
        isManager={false}
        isAssignee={false}
      />
      <TaskActivitySection {...activityProps} />
    </div>
  );
}
