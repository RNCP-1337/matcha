export default function About() {
  return (
    <div className="medium">
      <div className="page-head">
        <h1>How matching works</h1>
        <p>No mystery, no black box. Here is exactly what the site does with your profile.</p>
      </div>

      <div className="panel">
        <h2>Who you are shown</h2>
        <p>
          Suggestions only contain members whose gender matches what you are looking for, and for whom your
          gender matches what they are looking for. If you have not chosen an orientation, you are treated as
          bisexual.
        </p>
        <p style={{ marginBottom: 0 }}>
          Blocked members never appear, in suggestions or in search, and they cannot reach you.
        </p>
      </div>

      <div className="panel">
        <h2>The order of the list</h2>
        <p>Every suggestion gets a score built from three things:</p>
        <ul>
          <li>How close you are, measured from the coordinates of your two locations.</li>
          <li>How many interests you have in common.</li>
          <li>Their fame rating.</li>
        </ul>
        <p style={{ marginBottom: 0 }}>
          Distance carries the most weight, so people in your area come first. You can override the ranking at
          any time with the sort and filter controls.
        </p>
      </div>

      <div className="panel">
        <h2>The fame rating</h2>
        <p>The rating runs from 0 to 100 and is recomputed after every event that affects it:</p>
        <ul>
          <li>Likes received, up to 40 points.</li>
          <li>Mutual connections, up to 25 points.</li>
          <li>Distinct visitors on your profile, up to 15 points.</li>
          <li>Photos and interests filled in, up to 10 points.</li>
          <li>A complete profile, up to 10 points.</li>
          <li>Reports and blocks against you subtract points.</li>
        </ul>
        <p style={{ marginBottom: 0 }}>
          It rewards people who show up with a real profile and treat others well, rather than people who
          simply signed up early.
        </p>
      </div>

      <div className="panel">
        <h2>Location and privacy</h2>
        <p>
          GPS is never read without you asking for it. If you decline, you type a city instead, which is all
          the site needs to sort by distance. Either way you can change it whenever you want, and your exact
          coordinates are never shown to anyone: other members only see your city and the distance in
          kilometres.
        </p>
        <p>
          The map is the one place a position is drawn rather than described, and even there
          coordinates are rounded to about a kilometre before they leave the server, so a pin marks a
          neighbourhood and never an address.
        </p>
        <p style={{ marginBottom: 0 }}>
          Your email address and password are never part of a public profile.
        </p>
      </div>

      <div className="panel">
        <h2>Calls and meetups</h2>
        <p>
          Video and audio calls run directly between the two browsers. The server only passes the
          connection details along, and refuses to pass anything between members who are not connected, so
          the conversation itself never travels through it.
        </p>
        <p style={{ marginBottom: 0 }}>
          Meetup proposals work the same way as the chat: only connected members can send one, the invited
          person accepts or declines, and the organiser can cancel at any time.
        </p>
      </div>
    </div>
  );
}
