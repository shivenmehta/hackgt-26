export function FoodArt({
  kind = "bowl",
  variant = 0,
}: {
  kind?: "bowl" | "toast" | "wrap";
  variant?: number;
}) {
  const colors = ["#EBB965", "#B8D494", "#E9AA87", "#B5D8BD"];
  return (
    <svg
      viewBox="0 0 240 180"
      fill="none"
      aria-hidden="true"
      className="food-art"
    >
      <ellipse cx="120" cy="154" rx="79" ry="10" fill="#173B67" opacity=".08" />
      <circle cx="120" cy="88" r="75" fill="#fff" />
      <circle cx="120" cy="88" r="64" stroke="#DDE5E0" strokeWidth="2" />
      {kind === "toast" ? (
        <>
          <path
            d="M72 126V65C61 45 89 31 119 35c33-4 60 10 49 30v61Z"
            fill="#B77B43"
          />
          <path
            d="M80 118V65C70 49 95 41 120 43c28-3 51 7 41 22v53Z"
            fill="#EDC689"
          />
          <path
            d="M90 101c-4-27 37-52 55-37 15 14-8 44-38 44Z"
            fill="#749950"
          />
          <path
            d="M101 101l37-34M110 104l33-30"
            stroke="#C1D88B"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <ellipse cx="126" cy="78" rx="23" ry="20" fill="#FFFDF3" />
          <circle cx="129" cy="77" r="11" fill="#F4CE62" />
        </>
      ) : kind === "wrap" ? (
        <>
          <path d="M64 85q15-49 54-26l-5 70q-35 15-49-44Z" fill="#E4BF70" />
          <path d="M111 80q17-53 59-26l-8 73q-32 18-51-47Z" fill="#F1D496" />
          <path
            d="M69 82q22-31 45-15M117 76q20-35 47-15"
            stroke="#729C57"
            strokeWidth="14"
          />
          <path
            d="M73 90q20-26 39-13M124 86q15-30 37-14"
            stroke="#AF493A"
            strokeWidth="9"
            strokeDasharray="4 9"
            strokeLinecap="round"
          />
        </>
      ) : (
        <>
          <path
            d="M65 78a56 56 0 0 1 91-29l-36 45Z"
            fill={colors[variant % 4]}
          />
          <path d="M155 49a56 56 0 0 1 3 82l-38-37Z" fill="#92B87B" />
          <path d="M158 131a56 56 0 0 1-93-53l55 16Z" fill="#EBD7AF" />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <ellipse
              key={i}
              cx={82 + (i % 3) * 13}
              cy={103 + Math.floor(i / 3) * 15}
              rx="7"
              ry="5"
              fill="#C79D5B"
              transform={`rotate(-20 ${82 + (i % 3) * 13} ${103 + Math.floor(i / 3) * 15})`}
            />
          ))}
          <circle cx="140" cy="66" r="10" fill="#D4775B" />
          <circle cx="157" cy="91" r="9" fill="#D4775B" />
          <path
            d="m119 60-10 32m7-9 13-12m-16 5-8-10"
            stroke="#477E47"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <path
            d="m123 115 14 10m-10-15 14 10"
            stroke="#FFFDF3"
            strokeWidth="4"
            strokeLinecap="round"
          />
        </>
      )}
      <path
        d="M24 38v35m-7-35v24q0 11 7 11t7-11V38m-7 35v68M213 40v101m0-101q-12 20-12 46h12"
        stroke="#173B67"
        strokeWidth="4"
        strokeLinecap="round"
        opacity=".65"
      />
    </svg>
  );
}
export function BridgeMark() {
  return (
    <svg viewBox="0 0 40 32" width="37" height="30" aria-hidden="true">
      <circle cx="29" cy="8" r="6" fill="#F4CE62" />
      <path
        d="M4 27V15a16 16 0 0 1 32 0v12M4 16h32M12 16v11m8-11v11m8-11v11"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
