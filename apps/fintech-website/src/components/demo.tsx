import { PICTURES } from "@/lib/pictures";
import { SeeCardLink } from "./see-card-link";

export function Demo() {
  return (
    <div className="min-h-dvh bg-[#f3f0e8] text-[#161616]">
      <a href="#account" className="landing-skip">
        Skip to the account
      </a>

      <header className="flex items-center justify-between px-6 pt-[max(1.25rem,env(safe-area-inset-top))] pb-2 sm:px-10">
        <p className="text-2xl tracking-tight" translate="no">
          Sable
        </p>
        <p className="text-sm text-[#161616]/50">Private account</p>
      </header>

      <main className="pb-28">
        <section className="px-6 pt-14 pb-10 sm:px-10 sm:pt-20">
          <h1 className="max-w-3xl text-5xl leading-[1.02] tracking-tight text-balance sm:text-7xl">
            Hold money quietly.
          </h1>
          <p className="mt-5 max-w-md text-lg leading-7 text-[#161616]/60 text-pretty">
            A card, a transfer, and the member who holds them.
          </p>
          <div className="mt-8">
            <SeeCardLink href="#account">See the card</SeeCardLink>
          </div>
        </section>

        <section id="account" className="scroll-mt-6 px-6 py-8 sm:px-10">
          <h2 className="text-[12px] tracking-[0.16em] text-[#161616]/40 uppercase">
            The account
          </h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PICTURES.map((picture) => {
              const span =
                picture.id === "card"
                  ? "sm:col-span-2 lg:col-span-2 lg:row-span-2"
                  : "";
              return (
                <li key={picture.id} className={span}>
                  <figure>
                    <img
                      src={picture.src}
                      alt={picture.alt}
                      width={1200}
                      height={900}
                      className={`w-full rounded-[28px] ${
                        picture.id === "card"
                          ? "aspect-[4/3] object-contain lg:aspect-[4/5] lg:h-full"
                          : "aspect-[4/5] object-cover outline outline-1 outline-black/10"
                      }`}
                    />
                    <figcaption className="mt-3 text-sm leading-5 text-[#161616]/55">
                      {picture.label}
                    </figcaption>
                  </figure>
                </li>
              );
            })}
          </ul>
        </section>
      </main>
    </div>
  );
}
