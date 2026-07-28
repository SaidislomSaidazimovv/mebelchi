import React from 'react';
import { QORASU_PROFILE, EMAN_PROFILE, type ConstructionProfile } from '../../engine/catalogs/profiles';

interface ProfileSelectorProps {
  profile: ConstructionProfile;
  onChange: (profile: ConstructionProfile) => void;
}

export function ProfileSelector({ profile, onChange }: ProfileSelectorProps) {
  return null; // FULLY DISABLED PER USER REQUEST
  
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (e.target.value === "QORASU_16") {
      onChange(QORASU_PROFILE);
    } else if (e.target.value === "EMAN_18") {
      onChange(EMAN_PROFILE);
    }
  };

  return (
    <div className="controls-section separator">
      <div className="controls-head">
        <span className="controls-title">🛠 Ustaxona Profilini Tanlash</span>
      </div>
      <div className="panel-edit-area">
        <div className="panel-edit-row">
          <span className="row-title">Faol Profil:</span>
          <select
            value={profile.profileId}
            onChange={handleChange}
            className="thickness-select"
            style={{ fontWeight: "bold", color: "#2563eb" }}
          >
            <option value="QORASU_16">{QORASU_PROFILE.name}</option>
            <option value="EMAN_18">{EMAN_PROFILE.name}</option>
          </select>
        </div>
        <div style={{ fontSize: "12px", color: "#666", marginTop: "8px", lineHeight: "1.4" }}>
          Qoida isboti: Profil o'zgarganda dizayn (DesignNode) 0% o'zgaradi, lekin fazodagi 3D qalinliklar, jiyaklar va Kesim Ro'yxati avtomatik qayta hisoblanadi.
        </div>
      </div>
    </div>
  );
}
