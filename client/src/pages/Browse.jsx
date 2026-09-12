import Discovery from '../components/Discovery.jsx';

export default function Browse() {
  return (
    <Discovery
      endpoint="/api/browse"
      intro={
        <div className="page-head">
          <h1>Suggestions for you</h1>
          <p>
            Only members compatible with your gender and orientation appear here. They are ranked by how close
            they are, how many interests you share and their fame rating.
          </p>
        </div>
      }
    />
  );
}
