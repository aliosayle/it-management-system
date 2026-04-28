import { useCallback, useEffect, useState } from "react";
import Popup from "devextreme-react/popup";
import Button from "devextreme-react/button";
import SelectBox from "devextreme-react/select-box";
import TextBox from "devextreme-react/text-box";
import notify from "devextreme/ui/notify";
import { apiFetch } from "../api/client";
import { getErrorMessage } from "../utils/error-message";

export type CompanyOpt = { id: string; name: string };
export type SiteOpt = { id: string; label: string };

type PersonnelApiRow = {
  id: string;
  fullName: string;
  siteLabel: string;
  canAuthorizePurchases: boolean;
  isBuyer: boolean;
};

type SupplierApiRow = { id: string; name: string };
type ProductApiRow = { id: string; sku: string; name: string };

type PersonnelRole = "authorizer" | "buyer" | "bin";

export function QuickAddSupplierPopup({
  visible,
  onClose,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: (row: SupplierApiRow) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setName("");
      setEmail("");
      setPhone("");
    }
  }, [visible]);

  const save = useCallback(async () => {
    const n = name.trim();
    if (!n) {
      notify("Supplier name is required", "warning", 2500);
      return;
    }
    setSaving(true);
    try {
      const row = (await apiFetch("/api/suppliers", {
        method: "POST",
        body: JSON.stringify({
          name: n,
          email: email.trim() || null,
          phone: phone.trim() || null,
          notes: null,
        }),
      })) as SupplierApiRow;
      notify("Supplier added", "success", 2000);
      onCreated(row);
      onClose();
    } catch (e: unknown) {
      notify(getErrorMessage(e, "Could not add supplier"), "error", 5000);
    } finally {
      setSaving(false);
    }
  }, [name, email, phone, onCreated, onClose]);

  return (
    <Popup
      visible={visible}
      onHiding={onClose}
      showTitle
      title="New supplier"
      width={420}
      height="auto"
      showCloseButton
    >
      <div className="purchase-quick-add">
        <label className="purchase-quick-add__label">Name</label>
        <TextBox value={name} onValueChanged={(e) => setName(String(e.value ?? ""))} />
        <label className="purchase-quick-add__label">Email (optional)</label>
        <TextBox value={email} onValueChanged={(e) => setEmail(String(e.value ?? ""))} />
        <label className="purchase-quick-add__label">Phone (optional)</label>
        <TextBox value={phone} onValueChanged={(e) => setPhone(String(e.value ?? ""))} />
        <div className="purchase-quick-add__actions">
          <Button text="Cancel" stylingMode="outlined" onClick={onClose} disabled={saving} />
          <Button
            text="Save supplier"
            type="default"
            stylingMode="contained"
            onClick={() => void save()}
            disabled={saving}
          />
        </div>
      </div>
    </Popup>
  );
}

export function QuickAddProductPopup({
  visible,
  onClose,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: (row: ProductApiRow) => void;
}) {
  const [sku, setSku] = useState("");
  const [productName, setProductName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setSku("");
      setProductName("");
    }
  }, [visible]);

  const save = useCallback(async () => {
    const s = sku.trim();
    const n = productName.trim();
    if (!s || !n) {
      notify("SKU and product name are required", "warning", 2500);
      return;
    }
    setSaving(true);
    try {
      const row = (await apiFetch("/api/products", {
        method: "POST",
        body: JSON.stringify({ sku: s, name: n }),
      })) as ProductApiRow;
      notify("Product added", "success", 2000);
      onCreated(row);
      onClose();
    } catch (e: unknown) {
      notify(getErrorMessage(e, "Could not add product"), "error", 5000);
    } finally {
      setSaving(false);
    }
  }, [sku, productName, onCreated, onClose]);

  return (
    <Popup
      visible={visible}
      onHiding={onClose}
      showTitle
      title="New product"
      width={420}
      height="auto"
      showCloseButton
    >
      <div className="purchase-quick-add">
        <label className="purchase-quick-add__label">SKU</label>
        <TextBox value={sku} onValueChanged={(e) => setSku(String(e.value ?? ""))} />
        <label className="purchase-quick-add__label">Name</label>
        <TextBox value={productName} onValueChanged={(e) => setProductName(String(e.value ?? ""))} />
        <div className="purchase-quick-add__actions">
          <Button text="Cancel" stylingMode="outlined" onClick={onClose} disabled={saving} />
          <Button
            text="Save product"
            type="default"
            stylingMode="contained"
            onClick={() => void save()}
            disabled={saving}
          />
        </div>
      </div>
    </Popup>
  );
}

export function QuickAddCompanyPopup({
  visible,
  onClose,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: (row: CompanyOpt) => void;
}) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) setName("");
  }, [visible]);

  const save = useCallback(async () => {
    const n = name.trim();
    if (!n) {
      notify("Company name is required", "warning", 2500);
      return;
    }
    setSaving(true);
    try {
      const row = (await apiFetch("/api/companies", {
        method: "POST",
        body: JSON.stringify({ name: n }),
      })) as CompanyOpt;
      notify("Company added", "success", 2000);
      onCreated(row);
      onClose();
    } catch (e: unknown) {
      notify(getErrorMessage(e, "Could not add company"), "error", 5000);
    } finally {
      setSaving(false);
    }
  }, [name, onCreated, onClose]);

  return (
    <Popup
      visible={visible}
      onHiding={onClose}
      showTitle
      title="New company"
      width={380}
      height="auto"
      showCloseButton
    >
      <div className="purchase-quick-add">
        <label className="purchase-quick-add__label">Company name</label>
        <TextBox value={name} onValueChanged={(e) => setName(String(e.value ?? ""))} />
        <div className="purchase-quick-add__actions">
          <Button text="Cancel" stylingMode="outlined" onClick={onClose} disabled={saving} />
          <Button
            text="Save"
            type="default"
            stylingMode="contained"
            onClick={() => void save()}
            disabled={saving}
          />
        </div>
      </div>
    </Popup>
  );
}

export function QuickAddSitePopup({
  visible,
  companyOptions,
  onClose,
  onCreated,
  onOpenAddCompany,
}: {
  visible: boolean;
  companyOptions: CompanyOpt[];
  onClose: () => void;
  onCreated: (row: SiteOpt) => void;
  onOpenAddCompany: () => void;
}) {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [siteName, setSiteName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setCompanyId(null);
      setSiteName("");
    }
  }, [visible]);

  const save = useCallback(async () => {
    if (!companyId) {
      notify("Select a company", "warning", 2500);
      return;
    }
    const n = siteName.trim();
    if (!n) {
      notify("Site name is required", "warning", 2500);
      return;
    }
    setSaving(true);
    try {
      const row = (await apiFetch("/api/sites", {
        method: "POST",
        body: JSON.stringify({ companyId, name: n }),
      })) as { id: string; label: string };
      notify("Site added", "success", 2000);
      onCreated({ id: row.id, label: row.label });
      onClose();
    } catch (e: unknown) {
      notify(getErrorMessage(e, "Could not add site"), "error", 5000);
    } finally {
      setSaving(false);
    }
  }, [companyId, siteName, onCreated, onClose]);

  const companyDs = companyOptions.map((c) => ({ id: c.id, label: c.name }));

  return (
    <Popup
      visible={visible}
      onHiding={onClose}
      showTitle
      title="New site"
      width={440}
      height="auto"
      showCloseButton
    >
      <div className="purchase-quick-add">
        <label className="purchase-quick-add__label">Company</label>
        <div className="purchase-quick-add__row">
          <SelectBox
            dataSource={companyDs}
            displayExpr="label"
            valueExpr="id"
            value={companyId}
            onValueChanged={(e) => setCompanyId(e.value ?? null)}
            searchEnabled
            showClearButton
            placeholder="Select company…"
          />
          <Button icon="add" stylingMode="text" hint="New company" onClick={onOpenAddCompany} />
        </div>
        <label className="purchase-quick-add__label">Site name</label>
        <TextBox value={siteName} onValueChanged={(e) => setSiteName(String(e.value ?? ""))} />
        <div className="purchase-quick-add__actions">
          <Button text="Cancel" stylingMode="outlined" onClick={onClose} disabled={saving} />
          <Button
            text="Save site"
            type="default"
            stylingMode="contained"
            onClick={() => void save()}
            disabled={saving}
          />
        </div>
      </div>
    </Popup>
  );
}

export function QuickAddPersonnelPopup({
  visible,
  role,
  sites,
  onClose,
  onCreated,
  onOpenAddSite,
}: {
  visible: boolean;
  role: PersonnelRole;
  sites: SiteOpt[];
  onClose: () => void;
  onCreated: (row: PersonnelApiRow) => void;
  onOpenAddSite: () => void;
}) {
  const [siteId, setSiteId] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setSiteId(null);
      setFirstName("");
      setLastName("");
    }
  }, [visible]);

  const save = useCallback(async () => {
    if (!siteId) {
      notify("Select a site", "warning", 2500);
      return;
    }
    const fn = firstName.trim();
    const ln = lastName.trim();
    if (!fn || !ln) {
      notify("First and last name are required", "warning", 2500);
      return;
    }
    const canAuthorizePurchases = role === "authorizer";
    const isBuyer = role === "buyer";
    setSaving(true);
    try {
      const row = (await apiFetch("/api/personnel", {
        method: "POST",
        body: JSON.stringify({
          siteId,
          firstName: fn,
          lastName: ln,
          canAuthorizePurchases,
          isBuyer,
        }),
      })) as PersonnelApiRow;
      notify("Person added", "success", 2000);
      onCreated(row);
      onClose();
    } catch (e: unknown) {
      notify(getErrorMessage(e, "Could not add personnel"), "error", 5000);
    } finally {
      setSaving(false);
    }
  }, [siteId, firstName, lastName, role, onCreated, onClose]);

  const title =
    role === "authorizer"
      ? "New authorizer"
      : role === "buyer"
        ? "New buyer"
        : "New personnel (bin assignee)";

  const hint =
    role === "authorizer"
      ? "They will be allowed to authorize purchases."
      : role === "buyer"
        ? "They will be flagged as a buyer."
        : "Anyone can receive bin items; site identifies where they work.";

  const siteDs = sites.map((s) => ({ id: s.id, label: s.label }));

  return (
    <Popup
      visible={visible}
      onHiding={onClose}
      showTitle
      title={title}
      width={460}
      height="auto"
      showCloseButton
    >
      <div className="purchase-quick-add">
        <p className="purchase-quick-add__hint">{hint}</p>
        <label className="purchase-quick-add__label">Site</label>
        <div className="purchase-quick-add__row">
          <SelectBox
            dataSource={siteDs}
            displayExpr="label"
            valueExpr="id"
            value={siteId}
            onValueChanged={(e) => setSiteId(e.value ?? null)}
            searchEnabled
            showClearButton
            placeholder="Select site…"
          />
          <Button icon="add" stylingMode="text" hint="New site" onClick={onOpenAddSite} />
        </div>
        <label className="purchase-quick-add__label">First name</label>
        <TextBox value={firstName} onValueChanged={(e) => setFirstName(String(e.value ?? ""))} />
        <label className="purchase-quick-add__label">Last name</label>
        <TextBox value={lastName} onValueChanged={(e) => setLastName(String(e.value ?? ""))} />
        <div className="purchase-quick-add__actions">
          <Button text="Cancel" stylingMode="outlined" onClick={onClose} disabled={saving} />
          <Button
            text="Save"
            type="default"
            stylingMode="contained"
            onClick={() => void save()}
            disabled={saving}
          />
        </div>
      </div>
    </Popup>
  );
}
