import { FRUITS } from "@/lib/desk/fruits";

export function FruitGarnish() {
  return (
    <div className="fruit-garnish" aria-hidden>
      {FRUITS.slice(0, 6).map((fruit, i) => (
        <img key={fruit.id} className={`fruit f${i + 1}`} src={fruit.src} alt="" />
      ))}
    </div>
  );
}
