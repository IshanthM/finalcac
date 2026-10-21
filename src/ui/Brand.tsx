/** Brand mark: five bars that fade, like a ring dying away. */
export function Mark() {
  return (
    <svg viewBox="0 0 22 16" aria-hidden="true" focusable="false">
      {[[0, 16], [4.5, 10], [9, 13], [13.5, 6], [18, 8]].map(([x, h]) => <rect key={x} x={x} y={(16 - h!) / 2} width="2.2" height={h} rx="1.1" fill="currentColor" />)}
    </svg>
  );
}
