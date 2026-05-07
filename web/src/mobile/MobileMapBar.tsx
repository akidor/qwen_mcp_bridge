interface Props {
  onLayerClick: () => void;
  onSettingsClick: () => void;
}

export default function MobileMapBar({ onLayerClick, onSettingsClick }: Props) {
  return (
    <div className="mobile-map-bar">
      <button
        className="mobile-map-bar-button"
        onClick={onLayerClick}
        title="레이어"
        aria-label="레이어"
      >
        🗂️
      </button>
      <button
        className="mobile-map-bar-button"
        onClick={onSettingsClick}
        title="설정"
        aria-label="설정"
      >
        ⚙️
      </button>
    </div>
  );
}
