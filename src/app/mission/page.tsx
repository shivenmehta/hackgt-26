import type { Metadata } from "next";
import Link from "next/link";
import { BridgeMark } from "@/components/bridge/food-art";

export const metadata: Metadata = {
  title: "Our mission · Bridge",
  description:
    "Why we built Bridge: making nutritious meals and community food resources easier to find, plan, and afford.",
};

export default function MissionPage() {
  return (
    <div className="bridge">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <div className="header-inner">
          <Link className="brand" href="/" aria-label="Bridge home">
            <BridgeMark />
            bridge<span className="brand-period">.</span>
          </Link>
          <nav aria-label="Main navigation">
            <Link href="/">Weekly planner</Link>
            <Link href="/community">Community</Link>
            <Link href="/mission" className="nav-active" aria-current="page">
              Our mission
            </Link>
          </nav>
        </div>
      </header>
      <main id="main" className="mission-page">
        <section className="mission-opening" aria-labelledby="mission-title">
          <p className="mission-intro">Our mission</p>
          <h1 id="mission-title">Good food should be within reach.</h1>
          <p className="mission-lead">
            We’re building Bridge to help people find meals that fit their
            budget, their tastes, and the place they call home.
          </p>
          <Link className="mission-action" href="/">
            Plan your week
          </Link>
        </section>
        <section className="mission-story" aria-labelledby="inspiration-title">
          <h2 id="inspiration-title">Why we started</h2>
          <div>
            <p>
              Our inspiration began with a simple concern: when everyday
              expenses stretch a household’s budget, putting nutritious food on
              the table can become harder. Planning meals should help relieve
              that pressure.
            </p>
            <p>
              Income is only part of the picture. Where someone lives can shape
              the food available to them. In food deserts, access to affordable,
              nutritious food is limited. In food swamps, less nutritious
              options can crowd out healthier choices. Having food nearby does
              not always mean having food that meets your needs.
            </p>
            <p>
              We created Bridge to help address both barriers: the cost of
              eating well and the challenge of finding food locally. Our goal is
              to make the next step easier, whether that means planning dinner
              or finding a community food resource.
            </p>
          </div>
        </section>
        <section className="mission-how" aria-labelledby="how-title">
          <h2 id="how-title">From your preferences to your plate</h2>
          <ol className="mission-steps">
            <li>
              <h3>Tell us about your week</h3>
              <p>
                Share your budget, ZIP code, household size, cuisines, dietary
                preferences, and ingredients to avoid. Set your nutrition
                preferences and add any cooking needs.
              </p>
            </li>
            <li>
              <h3>Explore a plan made around you</h3>
              <p>
                Bridge filters recipes, compares their estimated nutrition with
                your goals, and uses ingredient prices to help assemble
                breakfast, lunch, and dinner for the week.
              </p>
            </li>
            <li>
              <h3>Make it work at home</h3>
              <p>
                Open a meal for its recipe, ingredients, estimated cost, and
                nutrition. Quantities scale with your household and portions.
                Explore replacements when you want something different.
              </p>
            </li>
          </ol>
          <p className="mission-estimates">
            Nutrition and costs are estimates. Prices reflect ingredients used,
            not a full grocery checkout. When local store prices are
            unavailable, Bridge may use reference-store prices or estimated
            averages. A plan may exceed your budget; those differences stay
            visible.
          </p>
        </section>
        <section
          className="mission-community"
          aria-labelledby="community-title"
        >
          <div>
            <h2 id="community-title">A place at the table starts nearby.</h2>
            <p>
              Meal planning is one part of food access. Bridge’s Community tools
              help you explore nearby food resources, SNAP retailer information,
              and community food-sharing posts. Check each listing for its
              source and availability details.
            </p>
            <Link className="mission-action" href="/community">
              Explore community resources
            </Link>
          </div>
          <p className="mission-closing">
            A little more choice.
            <br />A little less guesswork.
            <br />A little more within reach.
          </p>
        </section>
      </main>
    </div>
  );
}
