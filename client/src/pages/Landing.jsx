import { Link } from 'react-router-dom';

export default function Landing() {
  return (
    <div className="landing">
      <div>
        <h1>Meet people who are actually nearby.</h1>
        <p className="landing__lede">
          Matcha connects you with members who match your preferences, share your interests and live close
          enough that meeting is realistic. You decide who sees you, and you can stop at any time.
        </p>

        <ul className="landing__points">
          <li>
            <strong>Suggestions that respect your preferences</strong>
            Your gender and orientation filter the list from the start, and bisexual is the default when you
            have not said otherwise.
          </li>
          <li>
            <strong>Sorted by distance, shared interests and fame</strong>
            People in your area come first. Everything stays sortable and filterable by age, location, fame
            rating and interests.
          </li>
          <li>
            <strong>Chat only after both sides agree</strong>
            A conversation opens when two members have liked each other, and closes again if either one
            changes their mind.
          </li>
          <li>
            <strong>Location on your terms</strong>
            Share GPS if you want to, or type your city instead. You can change it whenever you like.
          </li>
        </ul>
      </div>

      <div className="panel">
        <h2>Get started</h2>
        <p className="muted small">
          Creating an account takes a minute. You will receive an email to confirm your address before you can
          sign in.
        </p>
        <div className="button-row">
          <Link className="button" to="/register">
            Create an account
          </Link>
          <Link className="button button--secondary" to="/login">
            Sign in
          </Link>
        </div>
        <div className="divider" />
        <p className="small muted" style={{ margin: 0 }}>
          Evaluating this project? The seeded demo account is <span className="mono">demo</span> and the
          password is printed by <span className="mono">make seed</span>.
        </p>
      </div>
    </div>
  );
}
