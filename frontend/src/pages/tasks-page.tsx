import { useCallback, useEffect, useMemo, useState, useRef } from "react";
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
  taskPriorityLabel,
  taskStatusLabel,
  type TaskScope,
} from "../constants/task-enums";
import {
  TaskDetailPanel,
  type TaskDetailData,
} from "../components/task-detail-panel/TaskDetailPanel";
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

type TaskDetail = TaskDetailData;

const emptyCreate = {
  title: "",
  description: "",
  assigneeId: null as string | null,
  priority: "NORMAL",
  dueAt: null as Date | null,
};

export default function TasksPage() {
  const { user } = useAuth();
  const { canAdd, canDelete, canRead } = usePagePermissions("tasks");
  const [searchParams, setSearchParams] = useSearchParams();
  const [scope, setScope] = useState<TaskScope>("mine");
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const [gridRefresh, setGridRefresh] = useState(0);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreate);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const detailReloadRef = useRef<(() => Promise<void>) | null>(null);

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
    void loadUsers();
  }, [loadUsers]);

  const openTaskDetail = useCallback(async (id: string) => {
    try {
      const row = (await apiFetch(`/api/tasks/${id}`)) as TaskDetail;
      setDetail(row);
      setDetailOpen(true);
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

  const detailId = detail?.id;
  const reloadDetail = useCallback(async () => {
    if (!detailId) return;
    const row = (await apiFetch(`/api/tasks/${detailId}`)) as TaskDetail;
    setDetail(row);
  }, [detailId]);

  detailReloadRef.current = reloadDetail;

  const renderDetailPopupContent = useCallback(() => {
    if (!detail) {
      return <div className="task-detail" style={{ minHeight: 48 }} />;
    }
    return (
      <TaskDetailPanel
        detail={detail}
        userId={user?.id}
        userOptions={userOptions}
        canDelete={canDelete}
        onReload={async () => {
          if (detailReloadRef.current) await detailReloadRef.current();
        }}
        onDeleted={() => {
          setDetailOpen(false);
          setDetail(null);
          refreshGrid();
        }}
        onSaved={() => refreshGrid()}
      />
    );
  }, [detail, user?.id, userOptions, canDelete]);

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
