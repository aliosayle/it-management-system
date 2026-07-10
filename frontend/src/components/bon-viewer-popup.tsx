import { useCallback, useEffect, useState } from "react";
import Popup from "devextreme-react/popup";
import Button from "devextreme-react/button";
import LoadIndicator from "devextreme-react/load-indicator";
import notify from "devextreme/ui/notify";
import { apiFetchBlob } from "../api/client";
import { getErrorMessage } from "../utils/error-message";
import { bonViewModeFromBlob, type BonViewMode } from "../utils/bon-view-mode";

type Props = {
  visible: boolean;
  purchaseId: string | null;
  fileName: string | null;
  onClose: () => void;
};

export function BonViewerPopup({ visible, purchaseId, fileName, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<BonViewMode>("unsupported");

  const clearPreview = useCallback(() => {
    setBlobUrl((prev) => {
      if (prev) {
        URL.revokeObjectURL(prev);
      }
      return null;
    });
    setError(null);
    setViewMode("unsupported");
  }, []);

  useEffect(() => {
    if (!visible) {
      clearPreview();
      setLoading(false);
      return;
    }
    if (!purchaseId || !fileName?.trim()) {
      clearPreview();
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    clearPreview();

    void (async () => {
      try {
        const blob = await apiFetchBlob(`/api/purchases/${purchaseId}/bon?inline=1`);
        if (cancelled) {
          return;
        }
        const mode = bonViewModeFromBlob(fileName, blob);
        const url = URL.createObjectURL(blob);
        setViewMode(mode);
        setBlobUrl(url);
      } catch (e: unknown) {
        if (!cancelled) {
          setError(getErrorMessage(e, "Failed to load receipt"));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visible, purchaseId, fileName, clearPreview]);

  const handleHiding = useCallback(() => {
    clearPreview();
    onClose();
  }, [clearPreview, onClose]);

  const downloadBon = useCallback(async () => {
    if (!purchaseId || !fileName?.trim()) {
      return;
    }
    try {
      const blob = await apiFetchBlob(`/api/purchases/${purchaseId}/bon`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      notify(getErrorMessage(e, "Download failed"), "error", 5000);
    }
  }, [purchaseId, fileName]);

  const title = fileName?.trim() ? `Receipt — ${fileName}` : "Receipt";

  return (
    <Popup
      visible={visible}
      onHiding={handleHiding}
      showTitle
      title={title}
      width="92vw"
      height="92vh"
      maxWidth={1200}
      showCloseButton
      wrapperAttr={{ class: "bon-viewer-popup-shell" }}
    >
      <div className="bon-viewer-popup">
        <div className="bon-viewer-popup__toolbar">
          <Button
            text="Download"
            icon="download"
            stylingMode="outlined"
            disabled={!purchaseId || !fileName || loading}
            onClick={() => void downloadBon()}
          />
          <Button text="Close" stylingMode="text" onClick={handleHiding} />
        </div>

        {loading ? (
          <div className="bon-viewer-popup__loading">
            <LoadIndicator visible height={40} width={40} />
            <span>Loading receipt…</span>
          </div>
        ) : null}

        {!loading && error ? (
          <div className="bon-viewer-popup__error" role="alert">
            {error}
          </div>
        ) : null}

        {!loading && !error && blobUrl && viewMode === "pdf" ? (
          <iframe
            className="bon-viewer-popup__frame"
            src={blobUrl}
            title={fileName ?? "Receipt PDF"}
          />
        ) : null}

        {!loading && !error && blobUrl && viewMode === "image" ? (
          <div className="bon-viewer-popup__image-wrap">
            <img className="bon-viewer-popup__image" src={blobUrl} alt={fileName ?? "Receipt"} />
          </div>
        ) : null}

        {!loading && !error && blobUrl && viewMode === "unsupported" ? (
          <div className="bon-viewer-popup__unsupported">
            <p>This file type cannot be previewed in the browser.</p>
            <Button
              text="Download file"
              type="default"
              stylingMode="contained"
              icon="download"
              onClick={() => void downloadBon()}
            />
          </div>
        ) : null}
      </div>
    </Popup>
  );
}
