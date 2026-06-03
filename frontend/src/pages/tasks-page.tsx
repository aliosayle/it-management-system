import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import CustomStore from "devextreme/data/custom_store";
import {
  Column,
  Paging,
  Pager,
  FilterRow,
  Item as GridToolbarItem,
} from "devextreme-react/data-grid";
import Button from "devextreme-react/button";
import Popup from "devextreme-react/popup";
import PopupDx from "devextreme-react/popup";
import SelectBox from "devextreme-react/select-box";
import TextArea from "devextreme-react/text-area";
import TextBox from "devextreme-react/text-box";
import DateBox from "devextreme-react/date-box";
import notify from "devextreme/ui/notify";
import { AppDataGrid } from "../components/app-data-grid";
import { PageReadGuard } from "../components/require-page-access";
import { usePagePermissions } from "../hooks/use-permissions";
import { useAuth } from "../contexts/auth-hooks";
import { apiFetch } from "../api/client";
import { getDataGridErrorMessage, getErrorMessage } from "../utils/error-message";
import {
  TASK_PRIORITY_OPTIONS,
  TASK_SCOPE_OPTIONS,
  TASK_STATUS_OPTIONS,
  taskPriorityLabel,
  taskStatusLabel,
  type TaskScope,
} from "../constants/task-enums";
import "../styles/tasks-page.scss";

type UserOption = { id: string; label: string };

type TaskListRow = {
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
  createdAt: string;
  updatedAt: string;
};

type TaskActivity = {
  id: string;
  type: string;
  body: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  createdAt: string;
  createdByName: string;
};

type TaskFollowUp = {
  id: string;
  scheduledAt: string;
  completedAt: string | null;
  note: string | null;
  assigneeName: string;
  createdByName: string;
};

type TaskDetail = TaskListRow & {
  followUps: TaskFollowUp[];
  activities: TaskActivity[];
};

const emptyCreate = {
  title: "",
  description: "",
  assigneeId: null as string | null,
  priority: "NORMAL",
  dueAt: null as Date | null,
};

export default function TasksPage() {
  const { user } = useAuth();
  const { canAdd, canEdit, canDelete, canRead } = usePagePermissions("tasks");
  const [searchParams, setSearchParams] = useSearchParams();
  const [scope, setScope] = useState<TaskScope>("mine");
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const [gridRefresh, setGridRefresh] = useState(0);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreate);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [detailSaving, setDetailSaving] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [followUpDate, setFollowUpDate] = useState<Date | null>(null);
  const [followUpNote, setFollowUpNote] = useState("");

  const scopeOptions = useMemo(
    () =>
      canRead
        ? TASK_SCOPE_OPTIONS
        : TASK_SCOPE_OPTIONS.filter((o) => o.value !== "all"),
    [canRead],
  );

  const loadUsers = useCallback(async () => {
    try {
      const rows = (await apiFetch("/api/tasks/meta/assignees")) as UserOption[];
      setUserOptions(rows);
    } catch {
      setUserOptions([]);
    }
  }, []);

  useEffect(() => {
    if (canAdd || canEdit) {
      void loadUsers();
    }
  }, [canAdd, canEdit, loadUsers]);

  const openTaskDetail = useCallback(async (id: string) => {
    try {
      const row = (await apiFetch(`/api/tasks/${id}`)) as TaskDetail;
      setDetail(row);
      setDetailOpen(true);
      setCommentText("");
      setFollowUpDate(null);
      setFollowUpNote("");
    } catch (e: unknown) {
      notify(getErrorMessage(e, "Failed to load task"), "error", 5000);
    }
  }, []);

  useEffect(() => {
    const taskId = searchParams.get("taskId");
    if (taskId) {
      void openTaskDetail(taskId);
      searchParams.delete("taskId");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams, openTaskDetail]);

  const dataSource = useMemo(
    () =>
      new CustomStore({
        key: "id",
        load: () =>
          apiFetch(`/api/tasks?scope=${scope}`) as Promise<TaskListRow[]>,
      }),
    [scope, gridRefresh],
  );

  const refreshGrid = () => setGridRefresh((n) => n + 1);

  const submitCreate = async () => {
    if (!createForm.title.trim() || !createForm.assigneeId) {
      notify("Title and assignee are required.", "warning", 4000);
      return;
    }
    try {
      await apiFetch("/api/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: createForm.title.trim(),
          description: createForm.description.trim() || null,
          assigneeId: createForm.assigneeId,
          priority: createForm.priority,
          dueAt: createForm.dueAt,
        }),
      });
      notify("Task created", "success", 2500);
      setCreateOpen(false);
      setCreateForm(emptyCreate);
      refreshGrid();
    } catch (e: unknown) {
      notify(getErrorMessage(e, "Failed to create task"), "error", 5000);
    }
  };

  const saveDetail = async () => {
    if (!detail) return;
    setDetailSaving(true);
    try {
      const updated = (await apiFetch(`/api/tasks/${detail.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: detail.title,
          description: detail.description,
          status: detail.status,
          priority: detail.priority,
          dueAt: detail.dueAt,
          assigneeId: detail.assigneeId,
        }),
      })) as TaskListRow;
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              ...updated,
              followUps: prev.followUps,
              activities: prev.activities,
            }
          : null,
      );
      notify("Task saved", "success", 2000);
      refreshGrid();
      void openTaskDetail(detail.id);
    } catch (e: unknown) {
      notify(getErrorMessage(e, "Failed to save task"), "error", 5000);
    } finally {
      setDetailSaving(false);
    }
  };

  const submitComment = async () => {
    if (!detail || !commentText.trim()) return;
    try {
      await apiFetch(`/api/tasks/${detail.id}/comments`, {
        method: "POST",
        body: JSON.stringify({ body: commentText.trim() }),
      });
      setCommentText("");
      void openTaskDetail(detail.id);
    } catch (e: unknown) {
      notify(getErrorMessage(e, "Failed to add comment"), "error", 5000);
    }
  };

  const scheduleFollowUp = async () => {
    if (!detail || !followUpDate) {
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
      void openTaskDetail(detail.id);
      notify("Follow-up scheduled", "success", 2000);
    } catch (e: unknown) {
      notify(getErrorMessage(e, "Failed to schedule follow-up"), "error", 5000);
    }
  };

  const completeFollowUp = async (followUpId: string) => {
    if (!detail) return;
    try {
      await apiFetch(`/api/tasks/${detail.id}/follow-ups/${followUpId}`, {
        method: "PATCH",
      });
      void openTaskDetail(detail.id);
    } catch (e: unknown) {
      notify(getErrorMessage(e, "Failed to complete follow-up"), "error", 5000);
    }
  };

  const deleteTask = async () => {
    if (!detail) return;
    if (!window.confirm(`Delete task "${detail.title}"?`)) return;
    try {
      await apiFetch(`/api/tasks/${detail.id}`, { method: "DELETE" });
      notify("Task deleted", "success", 2000);
      setDetailOpen(false);
      setDetail(null);
      refreshGrid();
    } catch (e: unknown) {
      notify(getErrorMessage(e, "Failed to delete task"), "error", 5000);
    }
  };

  const activityLine = (a: TaskActivity) => {
    if (a.type === "COMMENT") return a.body ?? "";
    if (a.type === "STATUS_CHANGE" && a.toStatus) {
      return `Status → ${taskStatusLabel(a.toStatus)}`;
    }
    return a.body ?? a.type.replace(/_/g, " ").toLowerCase();
  };

  /** contentRender keeps the form inside the popup overlay (avoids empty popup + content behind the grid). */
  const renderDetailPopupContent = useCallback(() => {
    if (!detail) {
      return <div className="task-detail" style={{ minHeight: 48 }} />;
    }

    const canEditDetailNow =
      canEdit ||
      user?.role === "ADMIN" ||
      detail.createdById === user?.id ||
      detail.assigneeId === user?.id;
    const canEditFieldsNow =
      canEdit || user?.role === "ADMIN" || detail.createdById === user?.id;

    return (
      <div className="task-detail">
        <div className="task-detail__fields">
          <div className="task-detail__row">
            <label>Title</label>
            <TextBox
              value={detail.title}
              readOnly={!canEditFieldsNow}
              onValueChanged={(e) =>
                setDetail((d) => (d ? { ...d, title: String(e.value ?? "") } : d))
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
                value={detail.status}
                readOnly={!canEditDetailNow}
                onValueChanged={(e) =>
                  setDetail((d) => (d ? { ...d, status: String(e.value) } : d))
                }
              />
            </div>
            <div>
              <label>Priority</label>
              <SelectBox
                dataSource={[...TASK_PRIORITY_OPTIONS]}
                displayExpr="text"
                valueExpr="value"
                value={detail.priority}
                readOnly={!canEditFieldsNow}
                onValueChanged={(e) =>
                  setDetail((d) => (d ? { ...d, priority: String(e.value) } : d))
                }
              />
            </div>
            <div>
              <label>Due</label>
              <DateBox
                type="datetime"
                value={detail.dueAt ? new Date(detail.dueAt) : null}
                readOnly={!canEditFieldsNow}
                showClearButton
                onValueChanged={(e) =>
                  setDetail((d) =>
                    d
                      ? {
                          ...d,
                          dueAt: e.value ? (e.value as Date).toISOString() : null,
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
              value={detail.assigneeId}
              readOnly={!canEditFieldsNow}
              searchEnabled
              onValueChanged={(e) =>
                setDetail((d) => (d ? { ...d, assigneeId: e.value as string } : d))
              }
            />
          </div>
          <div className="task-detail__row">
            <label>Description</label>
            <TextArea
              height={80}
              value={detail.description ?? ""}
              readOnly={!canEditFieldsNow}
              onValueChanged={(e) =>
                setDetail((d) =>
                  d ? { ...d, description: String(e.value ?? "") } : d,
                )
              }
            />
          </div>
          {canEditDetailNow ? (
            <div className="task-detail__actions">
              <Button
                text="Save"
                type="default"
                stylingMode="contained"
                disabled={detailSaving}
                onClick={() => void saveDetail()}
              />
              {canDelete || detail.createdById === user?.id ? (
                <Button
                  text="Delete"
                  stylingMode="outlined"
                  onClick={() => void deleteTask()}
                />
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="task-detail__section">
          <h3>Follow-ups</h3>
          <ul className="task-follow-up-list">
            {detail.followUps.map((f) => (
              <li key={f.id} className={f.completedAt ? "is-done" : ""}>
                <span>
                  {new Date(f.scheduledAt).toLocaleString()} — {f.assigneeName}
                  {f.note ? `: ${f.note}` : ""}
                </span>
                {!f.completedAt && canEditDetailNow ? (
                  <Button
                    text="Complete"
                    stylingMode="text"
                    onClick={() => void completeFollowUp(f.id)}
                  />
                ) : null}
              </li>
            ))}
          </ul>
          {canEditDetailNow ? (
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
                onClick={() => void scheduleFollowUp()}
              />
            </div>
          ) : null}
        </div>

        <div className="task-detail__section">
          <h3>Activity</h3>
          <ul className="task-activity-list">
            {detail.activities.map((a) => (
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
          {canEditDetailNow ? (
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
                onClick={() => void submitComment()}
              />
            </div>
          ) : null}
        </div>
      </div>
    );
  }, [
    detail,
    canEdit,
    canDelete,
    user?.id,
    user?.role,
    userOptions,
    detailSaving,
    commentText,
    followUpDate,
    followUpNote,
  ]);

  return (
    <PageReadGuard resource="tasks">
      <div className="content-block content-block--fill">
        <div className="page-toolbar">
          <h2>Tasks</h2>
        </div>
        <div className="page-grid-body">
          <AppDataGrid
            key={gridRefresh}
            permissionResource="tasks"
            persistenceKey="itm-grid-tasks-v1"
            dataSource={dataSource}
            repaintChangesOnly
            height="100%"
            showAddRowButton={false}
            toolbarItems={
              <>
                <GridToolbarItem location="before">
                  <SelectBox
                    dataSource={scopeOptions}
                    displayExpr="text"
                    valueExpr="value"
                    value={scope}
                    width={200}
                    onValueChanged={(e) => setScope((e.value as TaskScope) ?? "mine")}
                  />
                </GridToolbarItem>
                {canAdd ? (
                  <GridToolbarItem
                    location="before"
                    widget="dxButton"
                    options={{
                      text: "New task",
                      type: "default",
                      stylingMode: "contained",
                      icon: "add",
                      onClick: () => setCreateOpen(true),
                    }}
                  />
                ) : null}
              </>
            }
            onRowClick={(e) => {
              const row = e.data as TaskListRow | undefined;
              if (row?.id) void openTaskDetail(row.id);
            }}
            onCellPrepared={(e) => {
              if (e.rowType !== "data" || e.column?.dataField !== "dueAt") return;
              const row = e.data as TaskListRow;
              if (
                row.dueAt &&
                new Date(row.dueAt) < new Date() &&
                row.status !== "DONE" &&
                row.status !== "CANCELLED"
              ) {
                e.cellElement?.classList.add("task-due-overdue");
              }
            }}
            onDataErrorOccurred={(e) => {
              notify(getDataGridErrorMessage(e), "error", 5000);
            }}
          >
            <FilterRow visible />
            <Column dataField="title" minWidth={200} />
            <Column
              dataField="status"
              width={120}
              calculateCellValue={(row: TaskListRow) => taskStatusLabel(row.status)}
            />
            <Column
              dataField="priority"
              width={100}
              calculateCellValue={(row: TaskListRow) => taskPriorityLabel(row.priority)}
            />
            <Column dataField="assigneeName" caption="Assignee" width={160} />
            <Column dataField="createdByName" caption="Created by" width={140} />
            <Column dataField="dueAt" dataType="datetime" width={150} />
            <Column dataField="updatedAt" dataType="datetime" width={150} />
            <Paging defaultPageSize={25} />
            <Pager showPageSizeSelector showInfo />
          </AppDataGrid>
        </div>

        <Popup
          visible={createOpen}
          onHiding={() => setCreateOpen(false)}
          title="New task"
          showTitle
          width={520}
          height="auto"
          showCloseButton
        >
          <div className="task-form">
            <label>Title</label>
            <TextBox
              value={createForm.title}
              onValueChanged={(e) =>
                setCreateForm((f) => ({ ...f, title: String(e.value ?? "") }))
              }
            />
            <label>Assignee</label>
            <SelectBox
              dataSource={userOptions}
              displayExpr="label"
              valueExpr="id"
              value={createForm.assigneeId}
              searchEnabled
              onValueChanged={(e) =>
                setCreateForm((f) => ({ ...f, assigneeId: e.value as string }))
              }
            />
            <label>Priority</label>
            <SelectBox
              dataSource={[...TASK_PRIORITY_OPTIONS]}
              displayExpr="text"
              valueExpr="value"
              value={createForm.priority}
              onValueChanged={(e) =>
                setCreateForm((f) => ({ ...f, priority: String(e.value ?? "NORMAL") }))
              }
            />
            <label>Due date</label>
            <DateBox
              type="datetime"
              value={createForm.dueAt}
              showClearButton
              onValueChanged={(e) =>
                setCreateForm((f) => ({
                  ...f,
                  dueAt: (e.value as Date) ?? null,
                }))
              }
            />
            <label>Description</label>
            <TextArea
              height={100}
              value={createForm.description}
              onValueChanged={(e) =>
                setCreateForm((f) => ({ ...f, description: String(e.value ?? "") }))
              }
            />
            <div className="task-form__actions">
              <Button text="Cancel" stylingMode="outlined" onClick={() => setCreateOpen(false)} />
              <Button text="Create" type="default" stylingMode="contained" onClick={() => void submitCreate()} />
            </div>
          </div>
        </Popup>

        <PopupDx
          visible={detailOpen}
          onHiding={() => {
            setDetailOpen(false);
            setDetail(null);
          }}
          title={detail ? detail.title : "Task"}
          showTitle
          width={860}
          height="90vh"
          wrapperAttr={{ class: "task-detail-popup-shell" }}
          showCloseButton
          deferRendering={false}
          contentRender={renderDetailPopupContent}
        />
      </div>
    </PageReadGuard>
  );
}
