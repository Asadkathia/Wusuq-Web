// Pakistan Geo Seed - Provinces, Districts, Cities, Courts, Police Stations
// Run: node scripts/geo-seed.mjs

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const geoData = [
  {
    name: 'Punjab',
    districts: [
      {
        name: 'Lahore',
        cities: [
          {
            name: 'Lahore',
            courts: [
              { name: 'Lahore High Court', level: 'High Court' },
              { name: 'District & Sessions Court Lahore', level: 'Lower Court' },
              { name: 'Civil Court Lahore', level: 'Lower Court' },
              { name: 'Special Court Lahore', level: 'Special Court' },
            ],
            policeStations: [
              { name: 'Model Town Police Station' },
              { name: 'Defence Police Station' },
              { name: 'Gulberg Police Station' },
              { name: 'Cantonment Police Station' },
              { name: 'Township Police Station' },
            ],
          },
        ],
      },
      {
        name: 'Rawalpindi',
        cities: [
          {
            name: 'Rawalpindi',
            courts: [
              { name: 'District & Sessions Court Rawalpindi', level: 'Lower Court' },
              { name: 'Civil Court Rawalpindi', level: 'Lower Court' },
            ],
            policeStations: [
              { name: 'Saddar Police Station' },
              { name: 'Westridge Police Station' },
              { name: 'Cantt Police Station' },
            ],
          },
          {
            name: 'Islamabad',
            courts: [
              { name: 'Islamabad High Court', level: 'High Court' },
              { name: 'Supreme Court of Pakistan', level: 'Supreme Court' },
              { name: 'Federal Shariat Court', level: 'Federal Shariat Court' },
              { name: 'District & Sessions Court Islamabad', level: 'Lower Court' },
            ],
            policeStations: [
              { name: 'Margalla Police Station' },
              { name: 'Kohsar Police Station' },
              { name: 'Secretariat Police Station' },
              { name: 'Golra Police Station' },
            ],
          },
        ],
      },
      {
        name: 'Faisalabad',
        cities: [
          {
            name: 'Faisalabad',
            courts: [
              { name: 'District & Sessions Court Faisalabad', level: 'Lower Court' },
            ],
            policeStations: [
              { name: 'Civil Lines Police Station' },
              { name: 'Madina Town Police Station' },
            ],
          },
        ],
      },
      {
        name: 'Multan',
        cities: [
          {
            name: 'Multan',
            courts: [
              { name: 'District & Sessions Court Multan', level: 'Lower Court' },
            ],
            policeStations: [
              { name: 'Qasimpur Colony Police Station' },
              { name: 'Bohar Gate Police Station' },
            ],
          },
        ],
      },
      {
        name: 'Gujranwala',
        cities: [
          {
            name: 'Gujranwala',
            courts: [
              { name: 'District & Sessions Court Gujranwala', level: 'Lower Court' },
            ],
            policeStations: [{ name: 'Satellite Town Police Station' }],
          },
        ],
      },
    ],
  },
  {
    name: 'Sindh',
    districts: [
      {
        name: 'Karachi',
        cities: [
          {
            name: 'Karachi',
            courts: [
              { name: 'Sindh High Court', level: 'High Court' },
              { name: 'District & Sessions Court Karachi Central', level: 'Lower Court' },
              { name: 'District & Sessions Court Karachi South', level: 'Lower Court' },
              { name: 'Special Court Karachi', level: 'Special Court' },
            ],
            policeStations: [
              { name: 'Defence Police Station' },
              { name: 'Clifton Police Station' },
              { name: 'Gulshan-e-Iqbal Police Station' },
              { name: 'SITE Police Station' },
              { name: 'North Nazimabad Police Station' },
            ],
          },
        ],
      },
      {
        name: 'Hyderabad',
        cities: [
          {
            name: 'Hyderabad',
            courts: [
              { name: 'District & Sessions Court Hyderabad', level: 'Lower Court' },
            ],
            policeStations: [{ name: 'City Police Station Hyderabad' }],
          },
        ],
      },
      {
        name: 'Sukkur',
        cities: [
          {
            name: 'Sukkur',
            courts: [{ name: 'District & Sessions Court Sukkur', level: 'Lower Court' }],
            policeStations: [{ name: 'Sukkur City Police Station' }],
          },
        ],
      },
    ],
  },
  {
    name: 'Khyber Pakhtunkhwa',
    districts: [
      {
        name: 'Peshawar',
        cities: [
          {
            name: 'Peshawar',
            courts: [
              { name: 'Peshawar High Court', level: 'High Court' },
              { name: 'District & Sessions Court Peshawar', level: 'Lower Court' },
            ],
            policeStations: [
              { name: 'Cantt Police Station Peshawar' },
              { name: 'Hayatabad Police Station' },
              { name: 'University Town Police Station' },
            ],
          },
        ],
      },
      {
        name: 'Abbottabad',
        cities: [
          {
            name: 'Abbottabad',
            courts: [{ name: 'District & Sessions Court Abbottabad', level: 'Lower Court' }],
            policeStations: [{ name: 'City Police Station Abbottabad' }],
          },
        ],
      },
      {
        name: 'Mardan',
        cities: [
          {
            name: 'Mardan',
            courts: [{ name: 'District & Sessions Court Mardan', level: 'Lower Court' }],
            policeStations: [{ name: 'City Police Station Mardan' }],
          },
        ],
      },
    ],
  },
  {
    name: 'Balochistan',
    districts: [
      {
        name: 'Quetta',
        cities: [
          {
            name: 'Quetta',
            courts: [
              { name: 'Balochistan High Court', level: 'High Court' },
              { name: 'District & Sessions Court Quetta', level: 'Lower Court' },
            ],
            policeStations: [
              { name: 'City Police Station Quetta' },
              { name: 'Satellite Town Police Station Quetta' },
            ],
          },
        ],
      },
    ],
  },
  {
    name: 'Azad Kashmir',
    districts: [
      {
        name: 'Muzaffarabad',
        cities: [
          {
            name: 'Muzaffarabad',
            courts: [
              { name: 'Azad Kashmir High Court', level: 'High Court' },
              { name: 'District & Sessions Court Muzaffarabad', level: 'Lower Court' },
            ],
            policeStations: [{ name: 'City Police Station Muzaffarabad' }],
          },
        ],
      },
    ],
  },
  {
    name: 'Gilgit-Baltistan',
    districts: [
      {
        name: 'Gilgit',
        cities: [
          {
            name: 'Gilgit',
            courts: [{ name: 'Chief Court Gilgit-Baltistan', level: 'High Court' }],
            policeStations: [{ name: 'City Police Station Gilgit' }],
          },
        ],
      },
    ],
  },
];

async function main() {
  console.log('Seeding Pakistan geo data...');

  for (const province of geoData) {
    const prov = await prisma.geoProvince.upsert({
      where: { name: province.name },
      update: {},
      create: { name: province.name },
    });

    for (const district of province.districts) {
      const dist = await prisma.geoDistrict.upsert({
        where: { id: `${prov.id}-${district.name}` },
        update: {},
        create: { id: `${prov.id}-${district.name}`, name: district.name, provinceId: prov.id },
      });

      for (const city of district.cities) {
        const cty = await prisma.geoCity.upsert({
          where: { id: `${dist.id}-${city.name}` },
          update: {},
          create: { id: `${dist.id}-${city.name}`, name: city.name, districtId: dist.id },
        });

        for (const court of city.courts) {
          await prisma.geoCourt.upsert({
            where: { id: `${cty.id}-${court.name}` },
            update: {},
            create: { id: `${cty.id}-${court.name}`, name: court.name, level: court.level, cityId: cty.id },
          });
        }

        for (const ps of city.policeStations) {
          await prisma.geoPoliceStation.upsert({
            where: { id: `${cty.id}-${ps.name}` },
            update: {},
            create: { id: `${cty.id}-${ps.name}`, name: ps.name, cityId: cty.id },
          });
        }
      }
    }
  }

  console.log('Geo seed complete!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
