const WORDS = `
about above accept access account across action active actually address admin advice
after again against agree ahead album alive allow almost alone along already also
always among amount analysis anger animal another answer anybody anyone anything
apart apple apply approach april area argue around arrive article artist asleep
attack attempt attention august author autumn available avoid awake award aware
baby back bacon badly balance ball banana bank barely basic basket beach bear beauty
because become bedroom beer before begin behave behind believe belong below beneath
benefit beside best better between beyond bicycle bigger bird birth bishop bitter
black blame blanket blind block blood blue board boat body bone bonus book boots
border boring borrow bottle bottom bought bounce brain branch brave bread break
breakfast breath brick bridge bright bring broken brother brown brush bucket budget
build bullet bunch burden burn business butter button buyer cabin cable cake call
camera campaign cancel cancer candle candy canvas capital captain carbon careful
carpet carrot carry castle casual catch cattle cause ceiling center central century
certain chain chair chalk challenge champion chance change channel chapter charge
charm chart chase cheap check cheese chemical cherry chest chicken chief child
choice choose church circle citizen civil claim class clean clear clever client
climate climb clock close cloud club coach coast coffee cold collect college color
column combine come comfort command comment common company compare compete complete
computer concept concern conclude concrete condition confirm conflict confuse connect
consider consist constant contact contain content contest context continue contract
control convince cookie cooking copper copy corner correct cost cotton could council
count country couple courage course court cover crack craft crash crazy cream create
credit crime crisis critic cross crowd crown cruel crystal culture curious current
custom customer damage dance danger dark data daughter dead deal dear death debate
debt decade decide declare decline deep defeat defend define degree delay deliver
demand demon dense depend deposit depth describe desert design desire desk despite
destroy detail detect develop device devil diamond diary differ digital dinner
direct dirty disagree discover discuss disease dislike display distance divide
doctor document dollar domain donate door double doubt down dozen draft dragon drama
draw dream dress drink drive drop drug during dust duty eager early earn earth easy
economy edge edit education effect effort eight either elder elect element else
email embrace emerge emotion employ empty enable enemy energy engage engine english
enjoy enough enter entire entry equal error escape especially essay establish estate
even evening event ever every evidence exact example excellent except exchange excite
excuse exercise exist exit expand expect expense experience expert explain explore
export express extend extra extreme fabric face fact factor fail fair faith fall
false family famous fancy fantasy farm fashion fast father fault favor fear feature
federal feed feel female fence festival fever fiction field fight figure file film
final finance find fine finger finish fire firm first fish fitness five fix flag
flame flash flat flavor flight float floor flower fluid focus fold follow food foot
football force foreign forest forget forgive fork form formal format former fortune
forward found four frame free freedom freeze french fresh friend front fruit fuel
full fund funny future gain gallery game garage garden gather general generate
gentle genuine gesture ghost giant gift girl give glad glass global glove glory goal
goat gold golden golf good govern grab grade grain grand grant grape grass grave
great green greet grocery ground group grow guard guess guest guide guitar habit
hair half hall hand handle happen happy harbor hard harm harvest hate have head
health heart heat heavy height hello help hero hidden high hill hire history hobby
hold hole holiday hollow holy home honest honey honor hope horizon horror horse
hospital host hotel hour house human humor hundred hungry hunt hurry hurt husband
idea ideal identify ignore image imagine impact import impose impress improve
include income increase indeed index indicate industry infant inform initial injury
inner input inquiry inside insist inspire install instance instead insurance intend
interest internal internet interview into introduce invest invite iron island issue
item jacket january japan jazz jeans jewel join joint joke journal journey judge
juice july jump june junior jury just keen keep kettle key kick kid kill kind king
kiss kitchen knee knife knock know knowledge labor lack ladder lady lake land
language large last late later laugh launch laundry lawyer layer lead leaf league
learn least leather leave lecture left legal legend lemon length less lesson letter
level liberty library license life light like limit line link lion liquid list
listen little live load loan local lock logic lonely long look loop loose lord lose
loss lost lots loud love lovely lower loyal luck lunch lucky machine mad magazine
magic mail main maintain major make male manage manner many march margin marine
mark market marriage mask master match material matter maybe mayor meal mean measure
meat media medical medium meet member memory mental mention menu mercy merit message
metal method middle might mild mile milk mind mine minute mirror miss mission mistake
mix mobile model modern moment money monitor monkey month mood moon moral more
morning most mother motion motor mountain mouse mouth move movie much multiple
muscle museum music must mutual myself mystery naked name narrow nation native
natural nature near neat need negative neighbor neither nerve network never new news
next nice night nobody noise none noon normal north nose note nothing notice novel
nuclear number nurse object observe obtain obvious occasion occur ocean offer office
officer official often oil okay older olive once online only open operate opinion
oppose option orange order ordinary organ origin other ought outcome outdoor output
outside oven over overall owner oxygen pace pack page pain paint pair palace pale
palm panel panic paper parent park part partner party pass past patch path patient
pattern pause payment peace peak pearl pencil people pepper perfect perform perhaps
period permit person phase phone photo phrase physical piano pick picture piece pilot
pink pipe pitch place plain plan planet plant plastic plate play please pleasure
plenty plus pocket poem poet point police policy polite pool poor popular port
portion position positive possible post potato potential pound pour power practice
praise pray prefer prepare present press pretty prevent price pride primary prince
print prison private prize problem process produce product profile profit program
project promise promote proof proper propose protect proud prove provide public
publish pull pump punch pupil purchase pure purple purpose push put quality quarter
queen question quick quiet quit quite quote race radio rail rain raise random range
rapid rare rate rather ratio reach react read ready real reason recall receive
recent recipe record recover reduce refer reflect reform refuse regard region
regular reject relate relax release relief remain remember remind remote remove
repair repeat replace reply report request require rescue research reserve resist
resource respect respond rest result retail retire return reveal review reward rich
ride right ring rise risk river road robot rock role roll roof room root rope rose
rough round route royal rubber rude rule run rural sacred sad safe sail salad salary
sale salt same sample sand satisfy sauce save scale scene schedule scheme school
science score screen search season seat second secret section secure seed seek seem
select sell send senior sense sentence separate series serious serve service session
settle seven several severe shadow shake shall shame shape share sharp sheep sheet
shelf shell shelter shift shine ship shirt shock shoe shoot shop short should
shoulder shout show shower sick side sight sign signal silence silent silk silver
similar simple since sing single sister site situation size skill skin skirt sky
sleep slice slide slight slip slow small smart smell smile smoke smooth snow social
society sock soft soil solar soldier solid solve some song soon sorry sort soul
sound soup source south space spare speak special speech speed spell spend spirit
split spoke sport spot spread spring square stable staff stage stair stand standard
star start state station stay steady steal steam steel step stick still stock stone
stop store storm story straight strange street stress strike string strong struggle
student study stuff stupid style subject submit succeed such sudden suffer sugar
suggest suit summer sun supply support suppose sure surface surprise survey survive
sweet swim switch symbol system table tail take talent talk tall tank tape target
task taste tax teach team tear technology teeth telephone tell temple tend tennis
term terrible test text thank that theme then theory there they thick thin thing
think third this those though thought thousand threat three throat through throw
thumb thunder ticket tide tiger tight time tiny tired title today together toilet
tomato tomorrow tone tongue tonight tool tooth topic total touch tough tour toward
tower town toy trace track trade traffic train transfer travel treat tree trend
trial tribe trick trip trouble truck true trust truth turn twice twin type typical
ugly ultimate uncle under understand union unique unit universe unless until unusual
update upper upset urban urge usual valley value various vast vehicle version very
victim video view village violence virtue visit visual vital voice volume vote wage
wait wake walk wall want war warm warn wash waste watch water wave weak wealth
weapon wear weather wedding week weight welcome well west wheel when where whether
which while white whole whose wide wife wild will win wind window wine wing winter
wire wise wish witness woman wonder wood word work world worry worse worth would
wound wrap write wrong yard year yellow yes yesterday yield young your youth zero
zone
`;

const LEAKED = `
password passw0rd password1 password123 letmein qwerty qwertyui azerty abc123
123456 1234567 12345678 123456789 1234567890 111111 000000 123123 654321 iloveyou
admin administrator welcome monkey dragon sunshine princess football baseball
shadow master superman batman trustno1 whatever starwars pokemon computer internet
samsung google facebook hello123 matcha login user guest changeme secret access
freedom ninja pepper cheese soccer hockey summer winter spring autumn january
qazwsx zaq12wsx asdfgh zxcvbn 1q2w3e4r q1w2e3r4 michael jennifer jordan hunter
killer ranger buster thomas robert charlie andrew daniel matthew joshua nicole
jessica ashley amanda michelle 696969 121212 abcdefg abcd1234 passer passer1234
`;

const set = new Set();
for (const token of `${WORDS} ${LEAKED}`.split(/\s+/)) {
  const word = token.trim().toLowerCase();
  if (word) set.add(word);
}

export const commonWords = set;
