import Discovery from '../components/Discovery.jsx';

export default function Search() {
  return (
    <Discovery
      endpoint="/api/search"
      intro={
        <div className="page-head">
          <h1>Advanced search</h1>
          <p>
            Search the whole membership by age range, fame rating, location and interests. Orientation filters
            are not applied here, so you decide exactly who you are looking for.
          </p>
        </div>
      }
    />
  );
}
