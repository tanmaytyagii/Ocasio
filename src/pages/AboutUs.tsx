
const teamMembers = [
  {
    name: 'Khushi Saroha',
    role: 'Project Leader',
    skills: ['AI Developer', 'Backend Developer'],
    image: 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80',
  },
  {
    name: 'Tanmay Tyagi',
    role: 'Technical Lead',
    skills: ['AI Developer', 'Backend Developer'],
    image: 'https://images.unsplash.com/photo-1556157382-97eda2f9e2bf?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80',
  },
];

const AboutUs = () => {
  return (
    <div className="bg-canvas">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-16">
          <h1 className="text-4xl font-bold text-ink mb-4">About Ocasio</h1>
          <p className="text-xl text-muted max-w-3xl mx-auto">
            We're a team of passionate individuals dedicated to revolutionizing the event planning
            industry in India through technology and innovation.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-16 max-w-3xl mx-auto">
          {teamMembers.map((member) => (
            <div key={member.name} className="bg-white rounded-lg shadow-md overflow-hidden">
              <div className="aspect-w-1 aspect-h-1">
                <img
                  src={member.image}
                  alt={member.name}
                  className="w-full h-64 object-cover"
                />
              </div>
              <div className="p-6">
                <h3 className="text-xl font-semibold text-ink">{member.name}</h3>
                <p className="text-brand-700 font-medium">{member.role}</p>
                <div className="mt-2">
                  {member.skills.map((skill, index) => (
                    <span
                      key={index}
                      className="inline-block bg-canvas rounded-full px-3 py-1 text-sm font-semibold text-ink-soft mr-2 mb-2"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-lg shadow-md p-8">
          <h2 className="text-2xl font-bold text-ink mb-4">Our Mission</h2>
          <p className="text-muted mb-6">
            At Ocasio, we strive to simplify the event planning process by connecting people with the
            best vendors across India. Our platform brings together carefully curated professionals
            who share our commitment to excellence and customer satisfaction.
          </p>
          
          <h2 className="text-2xl font-bold text-ink mb-4">Our Vision</h2>
          <p className="text-muted">
            We envision becoming India's leading event vendor marketplace, where finding and booking
            the perfect vendors for any occasion is just a few clicks away. Through technology and
            innovation, we aim to transform how events are planned and executed across the country.
          </p>
        </div>
      </div>
    </div>
  );
}

export default AboutUs;