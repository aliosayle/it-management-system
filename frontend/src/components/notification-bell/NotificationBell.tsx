import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import DropDownButton from "devextreme-react/drop-down-button";
import type { ItemClickEvent } from "devextreme/ui/drop_down_button";
import {
  fetchNotifications,
  fetchUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationRow,
} from "../../api/notifications";
import "./NotificationBell.scss";

type MenuItem = {
  key: string;
  text: string;
  notification?: NotificationRow;
  isAction?: boolean;
};

export default function NotificationBell() {
  const navigate = useNavigate();
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<NotificationRow[]>([]);

  const refresh = useCallback(async () => {
    try {
      const [c, list] = await Promise.all([
        fetchUnreadNotificationCount(),
        fetchNotifications(false),
      ]);
      setCount(c);
      setItems(list.slice(0, 20));
    } catch {
      setCount(0);
      setItems([]);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 60_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const openTask = async (n: NotificationRow) => {
    if (!n.readAt) {
      try {
        await markNotificationRead(n.id);
      } catch {
        /* ignore */
      }
    }
    void refresh();
    if (n.taskId) {
      navigate(`/tasks?taskId=${encodeURIComponent(n.taskId)}`);
    } else {
      navigate("/tasks");
    }
  };

  const menuItems: MenuItem[] = useMemo(() => {
    if (items.length === 0) {
      return [{ key: "empty", text: "No notifications" }];
    }
    const rows: MenuItem[] = items.map((n) => ({
      key: n.id,
      text: `${n.readAt ? "" : "• "}${n.title}`,
      notification: n,
    }));
    if (count > 0) {
      rows.push({ key: "mark-all", text: "Mark all as read", isAction: true });
    }
    return rows;
  }, [items, count]);

  const onItemClick = (e: ItemClickEvent) => {
    const data = e.itemData as MenuItem | undefined;
    if (!data) return;
    if (data.isAction && data.key === "mark-all") {
      void markAllNotificationsRead().then(refresh);
      return;
    }
    if (data.notification) {
      void openTask(data.notification);
    }
  };

  return (
    <div className="notification-bell">
      <DropDownButton
        icon="bell"
        stylingMode="text"
        hint="Notifications"
        showArrowIcon={false}
        dropDownOptions={{ width: 340 }}
        items={menuItems}
        displayExpr="text"
        keyExpr="key"
        onItemClick={onItemClick}
        onButtonClick={() => void refresh()}
      />
      {count > 0 ? (
        <span className="notification-bell__badge" aria-label={`${count} unread`}>
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </div>
  );
}
